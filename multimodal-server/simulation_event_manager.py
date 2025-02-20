import os
from enum import Enum

import polyline
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event, RecurrentTimeSyncEvent
from multimodalsim.simulator.optimization_event import (
    EnvironmentIdle,
    EnvironmentUpdate,
    Hold,
    Optimize,
)
from multimodalsim.simulator.passenger_event import (
    PassengerAlighting,
    PassengerAssignment,
    PassengerReady,
    PassengerRelease,
    PassengerToBoard,
)
from multimodalsim.simulator.request import Trip
from multimodalsim.simulator.vehicle import Vehicle
from multimodalsim.simulator.vehicle_event import (
    VehicleAlighted,
    VehicleArrival,
    VehicleBoarded,
    VehicleBoarding,
    VehicleComplete,
    VehicleDeparture,
    VehicleNotification,
    VehicleReady,
    VehicleUpdatePositionEvent,
    VehicleWaiting,
)
from multimodalsim.state_machine.status import PassengerStatus, VehicleStatus
from socketio import Client


class Serializable:
    def serialize(self) -> dict:
        raise NotImplementedError()


def convert_passenger_status(status: PassengerStatus) -> str:
    if status == PassengerStatus.RELEASE:
        return "release"
    elif status == PassengerStatus.ASSIGNED:
        return "assigned"
    elif status == PassengerStatus.READY:
        return "ready"
    elif status == PassengerStatus.ONBOARD:
        return "onboard"
    elif status == PassengerStatus.COMPLETE:
        return "complete"
    else:
        raise ValueError(f"Unknown PassengerStatus {status}")


def convert_vehicle_status(status: VehicleStatus) -> str:
    if status == VehicleStatus.RELEASE:
        return "release"
    elif status == VehicleStatus.IDLE:
        return "idle"
    elif status == VehicleStatus.BOARDING:
        return "boarding"
    elif status == VehicleStatus.ENROUTE:
        return "enroute"
    elif status == VehicleStatus.ALIGHTING:
        return "alighting"
    elif status == VehicleStatus.COMPLETE:
        return "complete"
    else:
        raise ValueError(f"Unknown VehicleStatus {status}")


class VisualizedPassenger(Serializable):
    passenger_id: str
    name: str | None
    status: PassengerStatus

    def __init__(
        self,
        trip: Trip,
    ) -> None:
        self.passenger_id = str(trip.id)
        self.name = trip.name
        self.status = trip.status

    def serialize(self) -> dict:
        return {
            "id": self.passenger_id,
            "name": self.name,
            "status": convert_passenger_status(self.status),
        }


class VisualizedVehicle(Serializable):
    vehicle_id: str
    mode: str
    status: VehicleStatus
    latitude: float | None
    longitude: float | None
    polylines: dict[str, tuple[str, list[float]]] | None

    def __init__(self, vehicle: Vehicle) -> None:
        self.vehicle_id = vehicle.id
        self.mode = vehicle.mode
        self.status = vehicle.status

        if vehicle.position is not None:
            self.latitude = vehicle.position.lat
            self.longitude = vehicle.position.lon
        else:
            self.latitude = None
            self.longitude = None

        self.polylines = None
        if vehicle.polylines is not None:
            self.polylines = {}
            for stop_id, encoded_polyline in vehicle.polylines.items():
                encoded_polyline_string = encoded_polyline[0]
                polyline_coefficients = encoded_polyline[1]
                decoded_polyline_string = polyline.decode(encoded_polyline_string)
                self.polylines[stop_id] = {
                    "polyline": [
                        {"latitude": point[0], "longitude": point[1]}
                        for point in decoded_polyline_string
                    ],
                    "coefficients": polyline_coefficients,
                }

    def serialize(self) -> dict:
        serialized = {
            "id": self.vehicle_id,
            "mode": self.mode,
            "status": convert_vehicle_status(self.status),
        }
        if self.latitude is not None and self.longitude is not None:
            serialized["latitude"] = self.latitude
            serialized["longitude"] = self.longitude

        if self.polylines is not None:
            serialized["polylines"] = self.polylines
        return serialized


class VisualizedEnvironment(Serializable):
    passengers: list[VisualizedPassenger]
    vehicles: list[VisualizedVehicle]

    def __init__(self) -> None:
        self.passengers = {}
        self.vehicles = {}

    def add_passenger(self, passenger: VisualizedPassenger) -> None:
        self.passengers[passenger.passenger_id] = passenger

    def get_passenger(self, passenger_id: str) -> VisualizedPassenger:
        if passenger_id in self.passengers:
            return self.passengers[passenger_id]
        raise ValueError(f"Passenger {passenger_id} not found")

    def add_vehicle(self, vehicle: VisualizedVehicle) -> None:
        self.vehicles[vehicle.vehicle_id] = vehicle

    def get_vehicle(self, vehicle_id: str) -> VisualizedVehicle:
        if vehicle_id in self.vehicles:
            return self.vehicles[vehicle_id]
        raise ValueError(f"Vehicle {vehicle_id} not found")

    def serialize(self) -> dict:
        return {
            "passengers": [
                passenger.serialize() for passenger in self.passengers.values()
            ],
            "vehicles": [vehicle.serialize() for vehicle in self.vehicles.values()],
        }


class UpdateType(Enum):
    CREATE_PASSENGER = "createPassenger"
    CREATE_VEHICLE = "createVehicle"
    UPDATE_PASSENGER_STATUS = "updatePassengerStatus"
    UPDATE_VEHICLE_STATUS = "updateVehicleStatus"
    UPDATE_VEHICLE_POSITION = "updateVehiclePosition"


class PassengerStatusUpdate(Serializable):
    passenger_id: str
    status: PassengerStatus

    def __init__(self, passenger: Trip) -> None:
        self.passenger_id = passenger.id
        self.status = passenger.status

    def serialize(self) -> dict:
        return {
            "id": self.passenger_id,
            "status": convert_passenger_status(self.status),
        }


class VehicleStatusUpdate(Serializable):
    vehicle_id: str
    status: VehicleStatus

    def __init__(self, vehicle: Vehicle) -> None:
        self.vehicle_id = vehicle.id
        self.status = vehicle.status

    def serialize(self) -> dict:
        return {
            "id": self.vehicle_id,
            "status": convert_vehicle_status(self.status),
        }


class VehiclePositionUpdate(Serializable):
    vehicle_id: str
    latitude: float
    longitude: float

    def __init__(self, vehicle: Vehicle) -> None:
        self.vehicle_id = vehicle.id
        self.latitude = vehicle.position.lat
        self.longitude = vehicle.position.lon

    def serialize(self) -> dict:
        return {
            "id": self.vehicle_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


class Update(Serializable):
    type: UpdateType
    data: Serializable
    timestamp: float
    order: int

    def __init__(
        self,
        type: UpdateType,
        data: Serializable,
        timestamp: float,
    ) -> None:
        self.type = type
        self.data = data
        self.timestamp = timestamp
        self.order = 0

    def serialize(self) -> dict:
        return {
            "type": self.type.value,
            "data": self.data.serialize(),
            "timestamp": self.timestamp,
            "order": self.order,
        }


class SimulationEventManager:
    simulation_id: str
    update_counter: int
    updates: list[Update]
    environment: VisualizedEnvironment
    sio: Client

    def __init__(self, simulation_id: str, sio: Client) -> None:
        self.simulation_id = simulation_id
        self.update_counter = 0
        self.updates = []
        self.environment = VisualizedEnvironment()
        self.sio = sio

    def process_update(self, update: Update) -> None:
        if update.type == UpdateType.CREATE_PASSENGER:
            self.environment.add_passenger(update.data)
        elif update.type == UpdateType.CREATE_VEHICLE:
            self.environment.add_vehicle(update.data)
        elif update.type == UpdateType.UPDATE_PASSENGER_STATUS:
            passenger = self.environment.get_passenger(update.data.passenger_id)
            passenger.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_STATUS:
            vehicle = self.environment.get_vehicle(update.data.vehicle_id)
            vehicle.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_POSITION:
            vehicle = self.environment.get_vehicle(update.data.vehicle_id)
            vehicle.latitude = update.data.latitude
            vehicle.longitude = update.data.longitude

    def save_update(self, update: Update) -> None:
        current_directory = os.path.dirname(os.path.abspath(__file__))
        log_directory_name = "saved_simulations"
        log_directory_path = f"{current_directory}/{log_directory_name}"
        file_name = f"{self.simulation_id}.txt"
        file_path = f"{log_directory_path}/{file_name}"

        if not os.path.exists(log_directory_path):
            os.makedirs(log_directory_path)

        with open(file_path, "a") as file:
            file.write(str(update.serialize()) + "\n")
            # Save global state every 499 updates
            # The state will be on lines 500, 1000, 1500, etc.
            if self.update_counter % 499 == 0:
                file.write(str(self.environment.serialize()) + "\n")

    def add_update(self, update: Update) -> None:
        update.order = self.update_counter
        self.update_counter += 1
        self.process_update(update)
        self.updates.append(update)
        if self.sio.connected:
            self.sio.emit(
                "simulation-update",
                (
                    self.simulation_id,
                    update.serialize(),
                ),
            )

        self.save_update(update)

    def process_event(self, event: Event) -> str:
        # Optimize
        if isinstance(event, Optimize):
            # Do nothing ?
            return f"{event.time} TODO Optimize"

        # EnvironmentUpdate
        elif isinstance(event, EnvironmentUpdate):
            # Do nothing ?
            return f"{event.time} TODO EnvironmentUpdate"

        # EnvironmentIdle
        elif isinstance(event, EnvironmentIdle):
            # Do nothing ?
            return f"{event.time} TODO EnvironmentIdle"

        # PassengerRelease
        elif isinstance(event, PassengerRelease):
            passenger = VisualizedPassenger(event.trip)
            self.add_update(
                Update(
                    UpdateType.CREATE_PASSENGER,
                    passenger,
                    event.time,
                )
            )
            return f"{event.time} TODO PassengerRelease"

        # PassengerAssignment
        elif isinstance(event, PassengerAssignment):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO PassengerAssignment"

        # PassengerReady
        elif isinstance(event, PassengerReady):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO PassengerReady"

        # PassengerToBoard
        elif isinstance(event, PassengerToBoard):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO PassengerToBoard"

        # PassengerAlighting
        elif isinstance(event, PassengerAlighting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO PassengerAlighting"

        # VehicleWaiting
        elif isinstance(event, VehicleWaiting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate(event.state_machine.owner),
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleWaiting"

        # VehicleBoarding
        elif isinstance(event, VehicleBoarding):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleBoarding"

        elif isinstance(event, VehicleDeparture):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleDeparture"

        # VehicleArrival
        elif isinstance(event, VehicleArrival):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleArrival"

        # VehicleComplete
        elif isinstance(event, VehicleComplete):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate(
                        event.state_machine.owner,
                    ),
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleComplete"

        # VehicleReady
        elif isinstance(event, VehicleReady):
            vehicle = VisualizedVehicle(event.vehicle)
            self.add_update(
                Update(
                    UpdateType.CREATE_VEHICLE,
                    vehicle,
                    event.time,
                )
            )
            return f"{event.time} TODO VehicleReady"

        # VehicleNotification
        elif isinstance(event, VehicleNotification):
            return f"{event.time} TODO VehicleNotification"

        # VehicleBoarded
        elif isinstance(event, VehicleBoarded):
            return f"{event.time} TODO VehicleBoarded"

        # VehicleAlighted
        elif isinstance(event, VehicleAlighted):
            return f"{event.time} TODO VehicleAlighted"

        # VehicleUpdatePositionEvent
        elif isinstance(event, VehicleUpdatePositionEvent):
            updated_vehicle = event.vehicle
            current_visualized_vehicle = self.environment.get_vehicle(
                updated_vehicle.id
            )
            if event.vehicle.position is not None and (
                current_visualized_vehicle.latitude != event.vehicle.position.lat
                or current_visualized_vehicle.longitude != event.vehicle.position.lon
            ):
                self.add_update(
                    Update(
                        UpdateType.UPDATE_VEHICLE_POSITION,
                        VehiclePositionUpdate(
                            event.vehicle,
                        ),
                        event.time,
                    )
                )
            return f"{event.time} TODO VehicleUpdatePositionEvent"

        # RecurrentTimeSyncEvent
        elif isinstance(event, RecurrentTimeSyncEvent):
            # Do nothing ?
            return f"{event.time} TODO RecurrentTimeSyncEvent"

        # Hold
        elif isinstance(event, Hold):
            # Do nothing ?
            return f"{event.time} TODO Hold"

        else:
            raise NotImplementedError(f"Event {event} not implemented")
