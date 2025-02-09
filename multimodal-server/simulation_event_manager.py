from enum import Enum

from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import (
    Event,
    PauseEvent,
    RecurrentTimeSyncEvent,
    ResumeEvent,
)
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


class VisualizedVehicle(Serializable):
    vehicle_id: str
    mode: str
    status: VehicleStatus

    def __init__(self, vehicle: Vehicle) -> None:
        self.vehicle_id = vehicle.id
        self.mode = vehicle.mode
        self.status = vehicle.status

    def serialize(self) -> dict:
        return {
            "vehicle_id": self.vehicle_id,
            "mode": self.mode,
            "status": self.status.value,
        }


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
            "passenger_id": self.passenger_id,
            "name": self.name,
            "status": self.status.value,
        }


class VisualizedEnvironment:
    passengers: list[VisualizedPassenger]
    vehicles: list[VisualizedVehicle]

    def __init__(self) -> None:
        self.passengers = []
        self.vehicles = []

    def add_passenger(self, passenger: VisualizedPassenger) -> None:
        self.passengers.append(passenger)

    def get_passenger(self, passenger_id: str) -> VisualizedPassenger:
        for passenger in self.passengers:
            if passenger.passenger_id == passenger_id:
                return passenger
        raise ValueError(f"Passenger {passenger_id} not found")

    def add_vehicle(self, vehicle: VisualizedVehicle) -> None:
        self.vehicles.append(vehicle)

    def get_vehicle(self, vehicle_id: str) -> VisualizedVehicle:
        for vehicle in self.vehicles:
            if vehicle.vehicle_id == vehicle_id:
                return vehicle
        raise ValueError(f"Vehicle {vehicle_id} not found")


class UpdateType(Enum):
    CREATE_PASSENGER = "CreatePassenger"
    CREATE_VEHICLE = "CreateVehicle"
    UPDATE_PASSENGER_STATUS = "UpdatePassengerStatus"
    UPDATE_VEHICLE_STATUS = "UpdateVehicleStatus"


class StatusUpdate(Serializable):
    entity_id: str
    status: str

    def __init__(self, entity_id: str, status: str) -> None:
        self.entity_id = entity_id
        self.status = str(status)

    def serialize(self) -> dict:
        return {
            "entity_id": self.entity_id,
            "status": self.status,
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
            passenger = self.environment.get_passenger(update.data.entity_id)
            passenger.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_STATUS:
            vehicle = self.environment.get_vehicle(update.data.entity_id)
            vehicle.status = update.data.status

    def add_update(self, update: Update) -> None:
        update.order = self.update_counter
        self.update_counter += 1
        self.process_update(update)
        self.updates.append(update)
        if self.sio.connected:
            self.sio.emit(
                "simulationUpdate",
                (
                    self.simulation_id,
                    update.serialize(),
                ),
            )

    def process_event(self, event: Event, environment: Environment) -> str:
        # Optimize
        if isinstance(event, Optimize):
            # Do nothing ?
            return "TODO Optimize"

        # EnvironmentUpdate
        elif isinstance(event, EnvironmentUpdate):
            # Do nothing ?
            return "TODO EnvironmentUpdate"

        # EnvironmentIdle
        elif isinstance(event, EnvironmentIdle):
            # Do nothing ?
            return "TODO EnvironmentIdle"

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
            return "TODO PassengerRelease"

        # PassengerAssignment
        elif isinstance(event, PassengerAssignment):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    StatusUpdate(
                        event.__PassengerAssignment__trip.id,
                        event.__PassengerAssignment__trip.status,
                    ),
                    event.time,
                )
            )
            return "TODO PassengerAssignment"

        # PassengerReady
        elif isinstance(event, PassengerReady):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    StatusUpdate(
                        event.__PassengerReady__trip.id,
                        event.__PassengerReady__trip.status,
                    ),
                    event.time,
                )
            )
            return "TODO PassengerReady"

        # PassengerToBoard
        elif isinstance(event, PassengerToBoard):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    StatusUpdate(
                        event.__PassengerToBoard__trip.id,
                        event.__PassengerToBoard__trip.status,
                    ),
                    event.time,
                )
            )
            return "TODO PassengerToBoard"

        # PassengerAlighting
        elif isinstance(event, PassengerAlighting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    StatusUpdate(
                        event.__PassengerAlighting__trip.id,
                        event.__PassengerAlighting__trip.status,
                    ),
                    event.time,
                )
            )
            return "TODO PassengerAlighting"

        # VehicleWaiting
        elif isinstance(event, VehicleWaiting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    StatusUpdate(
                        event.state_machine.owner.id,
                        event.state_machine.owner.status,
                    ),
                    event.time,
                )
            )
            return "TODO VehicleWaiting"

        # VehicleBoarding
        elif isinstance(event, VehicleBoarding):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    StatusUpdate(
                        event.__VehicleBoarding__vehicle.id,
                        event.__VehicleBoarding__vehicle.status,
                    ),
                    event.time,
                )
            )
            return "TODO VehicleBoarding"

        elif isinstance(event, VehicleDeparture):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    StatusUpdate(
                        event.__VehicleDeparture__vehicle.id,
                        event.__VehicleDeparture__vehicle.status,
                    ),
                    event.time,
                )
            )
            return "TODO VehicleDeparture"

        # VehicleArrival
        elif isinstance(event, VehicleArrival):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    StatusUpdate(
                        event.__VehicleArrival__vehicle.id,
                        event.__VehicleArrival__vehicle.status,
                    ),
                    event.time,
                )
            )
            return "TODO VehicleArrival"

        # VehicleComplete
        elif isinstance(event, VehicleComplete):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    StatusUpdate(
                        event.__VehicleComplete__vehicle.id,
                        event.__VehicleComplete__vehicle.status,
                    ),
                    event.time,
                )
            )
            return "TODO VehicleComplete"

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
            return "TODO VehicleReady"

        # VehicleNotification
        elif isinstance(event, VehicleNotification):
            return "TODO VehicleNotification"

        # VehicleBoarded
        elif isinstance(event, VehicleBoarded):
            return "TODO VehicleBoarded"

        # VehicleAlighted
        elif isinstance(event, VehicleAlighted):
            return "TODO VehicleAlighted"

        # VehicleUpdatePositionEvent
        elif isinstance(event, VehicleUpdatePositionEvent):
            return "TODO VehicleUpdatePositionEvent"

        # RecurrentTimeSyncEvent
        elif isinstance(event, RecurrentTimeSyncEvent):
            # Do nothing ?
            return "TODO RecurrentTimeSyncEvent"

        # Hold
        elif isinstance(event, Hold):
            # Do nothing ?
            return "TODO Hold"

        # PauseEvent
        elif isinstance(event, PauseEvent):
            # Do nothing ?
            return "TODO PauseEvent"

        # ResumeEvent
        elif isinstance(event, ResumeEvent):
            # Do nothing ?
            return "TODO ResumeEvent"

        else:
            raise NotImplementedError(f"Event {event} not implemented")
