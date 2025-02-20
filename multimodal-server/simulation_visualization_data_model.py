import json
import os
from enum import Enum

import polyline
from multimodalsim.simulator.request import Trip
from multimodalsim.simulator.vehicle import Vehicle
from multimodalsim.state_machine.status import PassengerStatus, VehicleStatus
from server_utils import SAVE_VERSION


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


class Serializable:
    def serialize(self) -> dict:
        raise NotImplementedError()

    @classmethod
    def deserialize(cls, data: str) -> "Serializable":
        """
        Deserialize a dictionary into an instance of the class.

        If the dictionary is not valid, return None.
        """
        raise NotImplementedError()


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

    @classmethod
    def deserialize(cls, data: str) -> "VisualizedPassenger":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for VisualizedPassenger")

        passenger_id = str(data["id"])
        name = data.get("name", None)
        status = convert_string_to_passenger_status(data["status"])
        return VisualizedPassenger(passenger_id, name, status)


class VisualizedVehicle(Serializable):
    vehicle_id: str
    mode: str | None
    status: VehicleStatus
    latitude: float | None
    longitude: float | None
    polylines: dict[str, tuple[str, list[float]]] | None

    def __init__(
        self,
        vehicle_id: str,
        mode: str | None,
        status: VehicleStatus,
        latitude: float | None,
        longitude: float | None,
        polylines: dict[str, tuple[str, list[float]]] | None,
    ) -> None:
        self.vehicle_id = vehicle_id
        self.mode = mode
        self.status = status
        self.latitude = latitude
        self.longitude = longitude
        self.polylines = polylines

    @classmethod
    def from_vehicle(cls, vehicle: Vehicle) -> "VisualizedVehicle":
        polylines = None
        if vehicle.polylines is not None:
            polylines = {}
            for stop_id, encoded_polyline in vehicle.polylines.items():
                encoded_polyline_string = encoded_polyline[0]
                polyline_coefficients = encoded_polyline[1]
                decoded_polyline_string = polyline.decode(encoded_polyline_string)
                polylines[stop_id] = {
                    "polyline": [
                        {"latitude": point[0], "longitude": point[1]}
                        for point in decoded_polyline_string
                    ],
                    "coefficients": polyline_coefficients,
                }
        return cls(
            vehicle.id,
            vehicle.mode,
            vehicle.status,
            vehicle.position.lat if vehicle.position is not None else None,
            vehicle.position.lon if vehicle.position is not None else None,
            polylines,
        )

    def serialize(self) -> dict:
        serialized = {
            "id": self.vehicle_id,
            "status": convert_vehicle_status_to_string(self.status),
        }

        if self.mode is not None:
            serialized["mode"] = self.mode

        if self.latitude is not None and self.longitude is not None:
            serialized["latitude"] = self.latitude
            serialized["longitude"] = self.longitude

        if self.polylines is not None:
            serialized["polylines"] = self.polylines
        return serialized

    @classmethod
    def deserialize(cls, data: str | dict) -> "VisualizedVehicle":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for VisualizedVehicle")

        vehicle_id = str(data["id"])
        mode = data.get("mode", None)
        status = convert_string_to_vehicle_status(data["status"])
        latitude = data.get("latitude", None)
        if latitude is not None:
            latitude = float(latitude)
        longitude = data.get("longitude", None)
        if longitude is not None:
            longitude = float(longitude)

        polylines = data.get("polylines", None)
        if polylines is not None:
            polylines = {
                stop_id: (polyline_type, polyline_data)
                for stop_id, (polyline_type, polyline_data) in polylines.items()
            }

        vehicle = VisualizedVehicle(vehicle_id, mode, status, latitude, longitude, None)
        return vehicle


class VisualizedEnvironment(Serializable):
    passengers: list[VisualizedPassenger]
    vehicles: list[VisualizedVehicle]
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

    @classmethod
    def deserialize(cls, data: str) -> "VisualizedEnvironment":
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


class UpdateType(Enum):
    CREATE_PASSENGER = "createPassenger"
    CREATE_VEHICLE = "createVehicle"
    UPDATE_PASSENGER_STATUS = "updatePassengerStatus"
    UPDATE_VEHICLE_STATUS = "updateVehicleStatus"
    UPDATE_VEHICLE_POSITION = "updateVehiclePosition"


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

    @classmethod
    def deserialize(cls, data: str) -> "PassengerStatusUpdate":
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

    @classmethod
    def deserialize(cls, data: str) -> "VehicleStatusUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "status" not in data:
            raise ValueError("Invalid data for VehicleStatusUpdate")

        vehicle_id = str(data["id"])
        status = convert_string_to_vehicle_status(data["status"])
        return VehicleStatusUpdate(vehicle_id, status)


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

    @classmethod
    def deserialize(cls, data: str) -> "VehiclePositionUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "latitude" not in data or "longitude" not in data:
            raise ValueError("Invalid data for VehiclePositionUpdate")

        vehicle_id = str(data["id"])
        latitude = float(data["latitude"])
        longitude = float(data["longitude"])
        return VehiclePositionUpdate(vehicle_id, latitude, longitude)


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

    @classmethod
    def deserialize(cls, data: str) -> "Update":
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
        elif update_type == UpdateType.UPDATE_VEHICLE_POSITION:
            update_data = VehiclePositionUpdate.deserialize(update_data)

        update = Update(update_type, update_data, timestamp)
        update.order = data["order"]
        return update


class SimulationInformation(Serializable):
    version: str
    simulation_id: str
    name: str
    start_time: str
    data: str
    simulation_start_time: float | None
    simulation_end_time: float | None

    def __init__(
        self,
        simulation_id: str,
        data: str,
        simulation_start_time: str | None,
        simulation_end_time: str | None,
        version: str = None,
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
        return serialized

    @classmethod
    def deserialize(cls, data: str) -> "SimulationInformation":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "version" not in data or "simulationId" not in data:
            raise ValueError("Invalid data for SimulationInformation")

        version = str(data["version"])
        simulation_id = str(data["simulationId"])
        simulation_data = str(data["data"])

        simulation_start_time = data.get("simulationStartTime", None)
        simulation_end_time = data.get("simulationEndTime", None)

        return SimulationInformation(
            simulation_id,
            simulation_data,
            simulation_start_time,
            simulation_end_time,
            version,
        )


def get_simulation_save_directory_path() -> str:
    current_directory = os.path.dirname(os.path.abspath(__file__))
    directory_name = "saved_simulations"
    directory_path = f"{current_directory}/{directory_name}"

    if not os.path.exists(directory_path):
        os.makedirs(directory_path)

    return directory_path


def get_simulation_save_file_path(simulation_id: str) -> str:
    directory_path = get_simulation_save_directory_path()

    file_name = f"{simulation_id}.txt"
    file_path = f"{directory_path}/{file_name}"

    if not os.path.exists(file_path):
        with open(file_path, "w") as file:
            file.write("")

    return file_path


def extract_byte_offsets(simulation_id: str) -> list[int]:
    file_path = get_simulation_save_file_path(simulation_id)
    byte_offsets = []

    with open(file_path, "rb") as file:
        offset = file.tell()

        line = file.readline()
        while line:
            byte_offsets.append(offset)
            offset = file.tell()
            line = file.readline()

    return byte_offsets


def read_line_at_byte_offset(simulation_id: str, byte_offset: int) -> str:
    with open(get_simulation_save_file_path(simulation_id), "r") as file:
        file.seek(byte_offset)
        line = file.readline()
        return line


def read_lines_from_byte_offset(
    simulation_id: str, byte_offset: int, count: int
) -> list[str]:
    with open(get_simulation_save_file_path(simulation_id), "r") as file:
        file.seek(byte_offset)
        lines = []
        for _ in range(count):
            line = file.readline()
            if not line:
                break
            lines.append(line)
        return lines
