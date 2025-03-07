import json
import math
import os
from enum import Enum

from filelock import FileLock
from multimodalsim.simulator.request import Trip
from multimodalsim.simulator.stop import Stop
from multimodalsim.simulator.vehicle import Route, Vehicle
from multimodalsim.state_machine.status import PassengerStatus, VehicleStatus
from server_utils import SAVE_VERSION


# MARK: Enums
def convert_passenger_status_to_string(status: PassengerStatus) -> str:
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


def convert_vehicle_status_to_string(status: VehicleStatus) -> str:
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


def convert_string_to_passenger_status(status: str) -> PassengerStatus:
    if status == "release":
        return PassengerStatus.RELEASE
    elif status == "assigned":
        return PassengerStatus.ASSIGNED
    elif status == "ready":
        return PassengerStatus.READY
    elif status == "onboard":
        return PassengerStatus.ONBOARD
    elif status == "complete":
        return PassengerStatus.COMPLETE
    else:
        raise ValueError(f"Unknown PassengerStatus {status}")


def convert_string_to_vehicle_status(status: str) -> VehicleStatus:
    if status == "release":
        return VehicleStatus.RELEASE
    elif status == "idle":
        return VehicleStatus.IDLE
    elif status == "boarding":
        return VehicleStatus.BOARDING
    elif status == "enroute":
        return VehicleStatus.ENROUTE
    elif status == "alighting":
        return VehicleStatus.ALIGHTING
    elif status == "complete":
        return VehicleStatus.COMPLETE
    else:
        raise ValueError(f"Unknown VehicleStatus {status}")


# MARK: Serializable
class Serializable:
    def serialize(self) -> dict:
        raise NotImplementedError()

    @staticmethod
    def deserialize(data: str) -> "Serializable":
        """
        Deserialize a dictionary into an instance of the class.

        If the dictionary is not valid, return None.
        """
        raise NotImplementedError()


# MARK: Passenger
class VisualizedPassenger(Serializable):
    passenger_id: str
    name: str | None
    status: PassengerStatus

    def __init__(
        self,
        passenger_id: str,
        name: str | None,
        status: PassengerStatus,
    ) -> None:
        self.passenger_id = passenger_id
        self.name = name
        self.status = status

    @classmethod
    def from_trip(cls, trip: Trip) -> "VisualizedPassenger":
        return cls(trip.id, trip.name, trip.status)

    def serialize(self) -> dict:
        serialized = {
            "id": self.passenger_id,
            "status": convert_passenger_status_to_string(self.status),
        }

        if self.name is not None:
            serialized["name"] = self.name

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedPassenger":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for VisualizedPassenger")

        passenger_id = str(data["id"])
        name = data.get("name", None)
        status = convert_string_to_passenger_status(data["status"])
        return VisualizedPassenger(passenger_id, name, status)


# MARK: Stop
class VisualizedStop(Serializable):
    arrival_time: float
    departure_time: float | None

    def __init__(self, arrival_time: float, departure_time: float) -> None:
        self.arrival_time = arrival_time
        self.departure_time = departure_time

    @classmethod
    def from_stop(cls, stop: Stop) -> "VisualizedStop":
        return cls(
            stop.arrival_time,
            stop.departure_time if stop.departure_time != math.inf else None,
        )

    def serialize(self) -> dict:
        serialized = {"arrivalTime": self.arrival_time}

        if self.departure_time is not None:
            serialized["departureTime"] = self.departure_time

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedStop":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "arrivalTime" not in data:
            raise ValueError("Invalid data for VisualizedStop")

        arrival_time = float(data["arrivalTime"])
        departure_time = data.get("departureTime", None)

        return VisualizedStop(arrival_time, departure_time)


# MARK: Vehicle
class VisualizedVehicle(Serializable):
    vehicle_id: str
    mode: str | None
    status: VehicleStatus
    polylines: dict[str, tuple[str, list[float]]] | None
    previous_stops: list[VisualizedStop]
    current_stop: VisualizedStop | None
    next_stops: list[VisualizedStop]

    def __init__(
        self,
        vehicle_id: str | int,
        mode: str | None,
        status: VehicleStatus,
        polylines: dict[str, tuple[str, list[float]]] | None,
        previous_stops: list[VisualizedStop],
        current_stop: VisualizedStop | None,
        next_stops: list[VisualizedStop],
    ) -> None:
        self.vehicle_id = str(vehicle_id)
        self.mode = mode
        self.status = status
        self.polylines = polylines

        self.previous_stops = previous_stops
        self.current_stop = current_stop
        self.next_stops = next_stops

    @classmethod
    def from_vehicle_and_route(
        cls, vehicle: Vehicle, route: Route
    ) -> "VisualizedVehicle":
        previous_stops = [
            VisualizedStop.from_stop(stop) for stop in route.previous_stops
        ]
        current_stop = (
            VisualizedStop.from_stop(route.current_stop)
            if route.current_stop is not None
            else None
        )
        next_stops = [VisualizedStop.from_stop(stop) for stop in route.next_stops]
        return cls(
            vehicle.id,
            vehicle.mode,
            vehicle.status,
            vehicle.polylines,
            previous_stops,
            current_stop,
            next_stops,
        )

    def serialize(self) -> dict:
        serialized = {
            "id": self.vehicle_id,
            "status": convert_vehicle_status_to_string(self.status),
            "previousStops": [stop.serialize() for stop in self.previous_stops],
            "nextStops": [stop.serialize() for stop in self.next_stops],
        }

        if self.mode is not None:
            serialized["mode"] = self.mode

        if self.current_stop is not None:
            serialized["currentStop"] = self.current_stop.serialize()

        return serialized

    @staticmethod
    def deserialize(data: str | dict) -> "VisualizedVehicle":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if (
            "id" not in data
            or "status" not in data
            or "previousStops" not in data
            or "nextStops" not in data
        ):
            raise ValueError("Invalid data for VisualizedVehicle")

        vehicle_id = str(data["id"])
        mode = data.get("mode", None)
        status = convert_string_to_vehicle_status(data["status"])
        previous_stops = [
            VisualizedStop.deserialize(stop_data) for stop_data in data["previousStops"]
        ]
        next_stops = [
            VisualizedStop.deserialize(stop_data) for stop_data in data["nextStops"]
        ]

        current_stop = data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        return VisualizedVehicle(
            vehicle_id, mode, status, None, previous_stops, current_stop, next_stops
        )


# MARK: Environment
class VisualizedEnvironment(Serializable):
    passengers: dict[str, VisualizedPassenger]
    vehicles: dict[str, VisualizedVehicle]
    timestamp: float
    estimated_end_time: float
    order: int

    def __init__(self) -> None:
        self.passengers = {}
        self.vehicles = {}
        self.timestamp = 0
        self.estimated_end_time = 0
        self.order = 0

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
            "timestamp": self.timestamp,
            "estimatedEndTime": self.estimated_end_time,
            "order": self.order,
        }

    @staticmethod
    def deserialize(data: str) -> "VisualizedEnvironment":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if (
            "passengers" not in data
            or "vehicles" not in data
            or "timestamp" not in data
            or "estimatedEndTime" not in data
            or "order" not in data
        ):
            raise ValueError("Invalid data for VisualizedEnvironment")

        environment = VisualizedEnvironment()
        for passenger_data in data["passengers"]:
            passenger = VisualizedPassenger.deserialize(passenger_data)
            environment.add_passenger(passenger)

        for vehicle_data in data["vehicles"]:
            vehicle = VisualizedVehicle.deserialize(vehicle_data)
            environment.add_vehicle(vehicle)

        environment.timestamp = data["timestamp"]
        environment.estimated_end_time = data["estimatedEndTime"]
        environment.order = data["order"]

        return environment


# MARK: Updates
class UpdateType(Enum):
    CREATE_PASSENGER = "createPassenger"
    CREATE_VEHICLE = "createVehicle"
    UPDATE_PASSENGER_STATUS = "updatePassengerStatus"
    UPDATE_VEHICLE_STATUS = "updateVehicleStatus"
    UPDATE_VEHICLE_STOPS = "updateVehicleStops"


class PassengerStatusUpdate(Serializable):
    passenger_id: str
    status: PassengerStatus

    def __init__(self, passenger_id: str, status: PassengerStatus) -> None:
        self.passenger_id = passenger_id
        self.status = status

    def from_trip(trip: Trip) -> "PassengerStatusUpdate":
        return PassengerStatusUpdate(trip.id, trip.status)

    def serialize(self) -> dict:
        return {
            "id": self.passenger_id,
            "status": convert_passenger_status_to_string(self.status),
        }

    @staticmethod
    def deserialize(data: str) -> "PassengerStatusUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for PassengerStatusUpdate")

        passenger_id = str(data["id"])
        status = convert_string_to_passenger_status(data["status"])
        return PassengerStatusUpdate(passenger_id, status)


class VehicleStatusUpdate(Serializable):
    vehicle_id: str
    status: VehicleStatus

    def __init__(self, vehicle_id: str, status: VehicleStatus) -> None:
        self.vehicle_id = vehicle_id
        self.status = status

    def from_vehicle(vehicle: Vehicle) -> "VehicleStatusUpdate":
        return VehicleStatusUpdate(vehicle.id, vehicle.status)

    def serialize(self) -> dict:
        return {
            "id": self.vehicle_id,
            "status": convert_vehicle_status_to_string(self.status),
        }

    @staticmethod
    def deserialize(data: str) -> "VehicleStatusUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for VehicleStatusUpdate")

        vehicle_id = str(data["id"])
        status = convert_string_to_vehicle_status(data["status"])
        return VehicleStatusUpdate(vehicle_id, status)


class VehicleStopsUpdate(Serializable):
    vehicle_id: str
    previous_stops: list[VisualizedStop]
    current_stop: VisualizedStop | None
    next_stops: list[VisualizedStop]

    def __init__(
        self,
        vehicle_id: str,
        previous_stops: list[VisualizedStop],
        current_stop: VisualizedStop | None,
        next_stops: list[VisualizedStop],
    ) -> None:
        self.vehicle_id = vehicle_id
        self.previous_stops = previous_stops
        self.current_stop = current_stop
        self.next_stops = next_stops

    @classmethod
    def from_vehicle_and_route(
        cls, vehicle: Vehicle, route: Route
    ) -> "VehicleStopsUpdate":
        previous_stops = [
            VisualizedStop.from_stop(stop) for stop in route.previous_stops
        ]
        current_stop = (
            VisualizedStop.from_stop(route.current_stop)
            if route.current_stop is not None
            else None
        )
        next_stops = [VisualizedStop.from_stop(stop) for stop in route.next_stops]
        return cls(vehicle.id, previous_stops, current_stop, next_stops)

    def serialize(self) -> dict:
        serialized = {
            "id": self.vehicle_id,
            "previousStops": [stop.serialize() for stop in self.previous_stops],
            "nextStops": [stop.serialize() for stop in self.next_stops],
        }

        if self.current_stop is not None:
            serialized["currentStop"] = self.current_stop.serialize()

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VehicleStopsUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "previousStops" not in data or "nextStops" not in data:
            raise ValueError("Invalid data for VehicleStopsUpdate")

        vehicle_id = str(data["id"])
        previous_stops = [
            VisualizedStop.deserialize(stop_data) for stop_data in data["previousStops"]
        ]
        next_stops = [
            VisualizedStop.deserialize(stop_data) for stop_data in data["nextStops"]
        ]

        current_stop = data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        return VehicleStopsUpdate(vehicle_id, previous_stops, current_stop, next_stops)


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

    @staticmethod
    def deserialize(data: str) -> "Update":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if (
            "type" not in data
            or "data" not in data
            or "timestamp" not in data
            or "order" not in data
        ):
            raise ValueError("Invalid data for Update")

        update_type = UpdateType(data["type"])
        update_data = data["data"]
        timestamp = float(data["timestamp"])

        if update_type == UpdateType.CREATE_PASSENGER:
            update_data = VisualizedPassenger.deserialize(update_data)
        elif update_type == UpdateType.CREATE_VEHICLE:
            update_data = VisualizedVehicle.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_PASSENGER_STATUS:
            update_data = PassengerStatusUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STATUS:
            update_data = VehicleStatusUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STOPS:
            update_data = VehicleStopsUpdate.deserialize(update_data)

        update = Update(update_type, update_data, timestamp)
        update.order = data["order"]
        return update


# MARK: State
class VisualizedState(VisualizedEnvironment):
    updates: list[Update]

    def __init__(self) -> None:
        super().__init__()
        self.updates = []

    @classmethod
    def from_environment(cls, environment: VisualizedEnvironment) -> "VisualizedState":
        state = cls()
        state.passengers = environment.passengers
        state.vehicles = environment.vehicles
        state.timestamp = environment.timestamp
        state.estimated_end_time = environment.estimated_end_time
        state.order = environment.order
        return state

    def serialize(self) -> dict:
        serialized = super().serialize()
        serialized["updates"] = [update.serialize() for update in self.updates]
        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedState":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "updates" not in data:
            raise ValueError("Invalid data for VisualizedState")

        environment = VisualizedEnvironment.deserialize(data)

        state = VisualizedState()
        state.passengers = environment.passengers
        state.vehicles = environment.vehicles
        state.timestamp = environment.timestamp
        state.estimated_end_time = environment.estimated_end_time
        state.order = environment.order

        for update_data in data["updates"]:
            update = Update.deserialize(update_data)
            state.updates.append(update)

        return state


# MARK: Simulation Information
class SimulationInformation(Serializable):
    version: int
    simulation_id: str
    name: str
    start_time: str
    data: str
    simulation_start_time: float | None
    simulation_end_time: float | None
    last_update_order: int | None

    def __init__(
        self,
        simulation_id: str,
        data: str,
        simulation_start_time: str | None,
        simulation_end_time: str | None,
        last_update_order: int | None,
        version: int | None,
    ) -> None:
        self.version = version
        if self.version is None:
            self.version = SAVE_VERSION

        self.simulation_id = simulation_id

        self.name = simulation_id.split("-")[2]
        self.start_time = "-".join(simulation_id.split("-")[:2])
        self.data = data

        self.simulation_start_time = simulation_start_time
        self.simulation_end_time = simulation_end_time
        self.last_update_order = last_update_order

    def serialize(self) -> dict:
        serialized = {
            "version": self.version,
            "simulationId": self.simulation_id,
            "name": self.name,
            "startTime": self.start_time,
            "data": self.data,
        }
        if self.simulation_start_time is not None:
            serialized["simulationStartTime"] = self.simulation_start_time
        if self.simulation_end_time is not None:
            serialized["simulationEndTime"] = self.simulation_end_time
        if self.last_update_order is not None:
            serialized["lastUpdateOrder"] = self.last_update_order
        return serialized

    @staticmethod
    def deserialize(data: str) -> "SimulationInformation":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "version" not in data or "simulationId" not in data:
            raise ValueError("Invalid data for SimulationInformation")

        version = int(data["version"])
        simulation_id = str(data["simulationId"])
        simulation_data = str(data["data"])

        simulation_start_time = data.get("simulationStartTime", None)
        simulation_end_time = data.get("simulationEndTime", None)
        last_update_order = data.get("lastUpdateOrder", None)

        return SimulationInformation(
            simulation_id,
            simulation_data,
            simulation_start_time,
            simulation_end_time,
            last_update_order,
            version,
        )


# MARK: SVDM
class SimulationVisualizationDataManager:
    """
    This class manage reads and writes of simulation data for visualization.
    """

    __CORRUPTED_FILE_NAME = ".corrupted"
    __SAVED_SIMULATIONS_DIRECTORY_NAME = "saved_simulations"
    __SIMULATION_INFORMATION_FILE_NAME = "simulation_information.json"
    __POLYLINES_FILE_NAME = "polylines.json"
    __STATES_DIRECTORY_NAME = "states"

    __STATES_ORDER_MINIMUM_LENGTH = 8
    __STATES_TIMESTAMP_MINIMUM_LENGTH = 8

    __MINIMUM_STATES_BEFORE = 1
    __MINIMUM_STATES_AFTER = 1

    # MARK: +- Format
    @staticmethod
    def __format_json_readable(data: dict, file: str) -> str:
        return json.dump(data, file, indent=2, separators=(",", ": "), sort_keys=True)

    @staticmethod
    def __format_json_one_line(data: dict, file: str) -> str:
        # Add new line before if not empty
        if file.tell() != 0:
            file.write("\n")
        return json.dump(data, file, separators=(",", ":"))

    # MARK: +- File paths
    @staticmethod
    def get_saved_simulations_directory_path() -> str:
        current_directory = os.path.dirname(os.path.abspath(__file__))
        directory_path = f"{current_directory}/{SimulationVisualizationDataManager.__SAVED_SIMULATIONS_DIRECTORY_NAME}"

        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        return directory_path

    @staticmethod
    def get_all_saved_simulation_ids() -> list[str]:
        directory_path = (
            SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        )
        return [simulation_id for simulation_id in os.listdir(directory_path)]

    @staticmethod
    def get_saved_simulation_directory_path(simulation_id: str) -> str:
        directory_path = (
            SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        )
        simulation_directory_path = f"{directory_path}/{simulation_id}"

        if not os.path.exists(simulation_directory_path):
            os.makedirs(simulation_directory_path)

        return simulation_directory_path

    # MARK: +- Corrupted
    @staticmethod
    def is_simulation_corrupted(simulation_id: str) -> bool:
        simulation_directory_path = (
            SimulationVisualizationDataManager.get_saved_simulation_directory_path(
                simulation_id
            )
        )

        return os.path.exists(
            f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}"
        )

    @staticmethod
    def mark_simulation_as_corrupted(simulation_id: str) -> None:
        simulation_directory_path = (
            SimulationVisualizationDataManager.get_saved_simulation_directory_path(
                simulation_id
            )
        )

        file_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}"

        with open(file_path, "w") as file:
            file.write("")

    # MARK: +- Simulation Information
    @staticmethod
    def get_saved_simulation_information_file_path(simulation_id: str) -> str:
        simulation_directory_path = (
            SimulationVisualizationDataManager.get_saved_simulation_directory_path(
                simulation_id
            )
        )
        file_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__SIMULATION_INFORMATION_FILE_NAME}"

        if not os.path.exists(file_path):
            with open(file_path, "w") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_simulation_information(
        simulation_id: str, simulation_information: SimulationInformation
    ) -> None:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(
            simulation_id
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w") as file:
                SimulationVisualizationDataManager.__format_json_readable(
                    simulation_information.serialize(), file
                )

    @staticmethod
    def get_simulation_information(simulation_id: str) -> SimulationInformation:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(
            simulation_id
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "r") as file:
                data = file.read()
                return SimulationInformation.deserialize(data)

    # MARK: +- States and updates
    @staticmethod
    def get_saved_simulation_states_folder_path(simulation_id: str) -> str:
        simulation_directory_path = (
            SimulationVisualizationDataManager.get_saved_simulation_directory_path(
                simulation_id
            )
        )
        folder_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__STATES_DIRECTORY_NAME}"

        if not os.path.exists(folder_path):
            os.makedirs(folder_path)

        return folder_path

    @staticmethod
    def get_saved_simulation_state_file_path(
        simulation_id: str, order: int, timestamp: float
    ) -> str:
        folder_path = (
            SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(
                simulation_id
            )
        )

        padded_order = str(order).zfill(
            SimulationVisualizationDataManager.__STATES_ORDER_MINIMUM_LENGTH
        )
        padded_timestamp = str(int(timestamp)).zfill(
            SimulationVisualizationDataManager.__STATES_TIMESTAMP_MINIMUM_LENGTH
        )

        # States and updates are stored in a .jsonl file to speed up reads and writes
        # Each line is a state (the first line) or an update (the following lines)
        file_path = f"{folder_path}/{padded_order}-{padded_timestamp}.jsonl"

        if not os.path.exists(file_path):
            with open(file_path, "w") as file:
                file.write("")

        return file_path

    @staticmethod
    def get_sorted_states(simulation_id: str) -> list[tuple[int, float]]:
        folder_path = (
            SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(
                simulation_id
            )
        )

        all_states_files = os.listdir(folder_path)

        states = []
        for state_file in all_states_files:
            order, timestamp = state_file.split("-")
            states.append((int(order), float(timestamp.split(".")[0])))

        return sorted(states, key=lambda x: (x[1], x[0]))

    @staticmethod
    def save_state(simulation_id: str, environment: VisualizedEnvironment) -> str:
        file_path = (
            SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                simulation_id, environment.order, environment.timestamp
            )
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w") as file:
                SimulationVisualizationDataManager.__format_json_one_line(
                    environment.serialize(), file
                )

        return file_path

    @staticmethod
    def save_update(file_path: str, update: Update) -> None:
        lock = FileLock(f"{file_path}.lock")
        with lock:
            with open(file_path, "a") as file:
                SimulationVisualizationDataManager.__format_json_one_line(
                    update.serialize(), file
                )

    @staticmethod
    def get_missing_states(
        simulation_id: str, first_order: int, last_order: int, visualization_time: float
    ) -> tuple[list[VisualizedState], list[int]]:
        sorted_states = SimulationVisualizationDataManager.get_sorted_states(
            simulation_id
        )

        if len(sorted_states) == 0:
            return [], []

        last_state_with_lower_timestamp_index = None
        first_state_with_greater_timestamp_index = None

        for index, (order, state_timestamp) in enumerate(sorted_states):
            if state_timestamp < visualization_time:
                last_state_with_lower_or_equal_timestamp_index = index
            elif state_timestamp > visualization_time:
                first_state_with_greater_timestamp_index = index
                break

        if first_state_with_greater_timestamp_index is None:
            first_state_with_greater_timestamp_index = len(sorted_states)

        if last_state_with_lower_timestamp_index is None:
            first_state_index = 0
        else:
            first_state_index = last_state_with_lower_timestamp_index + 1

        last_state_index = first_state_with_greater_timestamp_index - 1

        first_state_index = max(
            0,
            first_state_index
            - SimulationVisualizationDataManager.__MINIMUM_STATES_BEFORE,
        )
        last_state_index = min(
            len(sorted_states) - 1,
            last_state_index
            + SimulationVisualizationDataManager.__MINIMUM_STATES_AFTER,
        )

        missing_states = []
        state_orders_to_keep = []
        for index in range(first_state_index, last_state_index + 1):
            order, state_timestamp = sorted_states[index]
            if first_order <= order <= last_order and index != len(sorted_states) - 1:
                state_orders_to_keep.append(order)
                continue

            state_file_path = (
                SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                    simulation_id, order, state_timestamp
                )
            )

            lock = FileLock(f"{state_file_path}.lock")

            with lock:
                with open(state_file_path, "r") as file:
                    environment_data = file.readline()
                    environment = VisualizedEnvironment.deserialize(environment_data)
                    state = VisualizedState.from_environment(environment)

                    updates_data = file.readlines()
                    for update_data in updates_data:
                        update = Update.deserialize(update_data)
                        state.updates.append(update)

                    missing_states.append(state)

        return missing_states, state_orders_to_keep

    # MARK: +- Polylines
    @staticmethod
    def get_saved_simulation_polylines_file_path(simulation_id: str) -> str:
        simulation_directory_path = (
            SimulationVisualizationDataManager.get_saved_simulation_directory_path(
                simulation_id
            )
        )
        file_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__POLYLINES_FILE_NAME}"

        if not os.path.exists(file_path):
            with open(file_path, "w") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_polylines(simulation_id: str, environment: VisualizedEnvironment) -> None:
        file_path = (
            SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(
                simulation_id
            )
        )

        lock = FileLock(f"{file_path}.lock")

        polylines_by_vehicle_id = {
            vehicle_id: vehicle.polylines
            for vehicle_id, vehicle in environment.vehicles.items()
        }

        with lock:
            with open(file_path, "w") as file:
                SimulationVisualizationDataManager.__format_json_readable(
                    polylines_by_vehicle_id, file
                )

    @staticmethod
    def get_polylines(
        simulation_id: str,
    ) -> dict[str, dict[str, tuple[str, list[float]]]]:
        file_path = (
            SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(
                simulation_id
            )
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "r") as file:
                data = file.read()
                return json.loads(data)
