# pylint: disable=too-many-lines
import json
import math
import os
from enum import Enum

import multimodalsim.optimization.dispatcher  # (To avoid circular import error) pylint: disable=unused-import
from filelock import FileLock
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.request import Leg, Trip
from multimodalsim.simulator.stop import Stop
from multimodalsim.simulator.vehicle import Route, Vehicle
from multimodalsim.state_machine.status import PassengerStatus, VehicleStatus

from multimodalsim_viewer.common.utils import (
    SAVE_VERSION,
    SIMULATION_SAVE_FILE_SEPARATOR,
    get_data_directory_path,
)


# MARK: Enums
def convert_passenger_status_to_string(status: PassengerStatus) -> str:
    if status == PassengerStatus.RELEASE:
        return "release"
    if status == PassengerStatus.ASSIGNED:
        return "assigned"
    if status == PassengerStatus.READY:
        return "ready"
    if status == PassengerStatus.ONBOARD:
        return "onboard"
    if status == PassengerStatus.COMPLETE:
        return "complete"
    raise ValueError(f"Unknown PassengerStatus {status}")


def convert_vehicle_status_to_string(status: VehicleStatus) -> str:
    if status == VehicleStatus.RELEASE:
        return "release"
    if status == VehicleStatus.IDLE:
        return "idle"
    if status == VehicleStatus.BOARDING:
        return "boarding"
    if status == VehicleStatus.ENROUTE:
        return "enroute"
    if status == VehicleStatus.ALIGHTING:
        return "alighting"
    if status == VehicleStatus.COMPLETE:
        return "complete"
    raise ValueError(f"Unknown VehicleStatus {status}")


def convert_string_to_passenger_status(status: str) -> PassengerStatus:
    if status == "release":
        return PassengerStatus.RELEASE
    if status == "assigned":
        return PassengerStatus.ASSIGNED
    if status == "ready":
        return PassengerStatus.READY
    if status == "onboard":
        return PassengerStatus.ONBOARD
    if status == "complete":
        return PassengerStatus.COMPLETE
    raise ValueError(f"Unknown PassengerStatus {status}")


def convert_string_to_vehicle_status(status: str) -> VehicleStatus:
    if status == "release":
        return VehicleStatus.RELEASE
    if status == "idle":
        return VehicleStatus.IDLE
    if status == "boarding":
        return VehicleStatus.BOARDING
    if status == "enroute":
        return VehicleStatus.ENROUTE
    if status == "alighting":
        return VehicleStatus.ALIGHTING
    if status == "complete":
        return VehicleStatus.COMPLETE
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


# MARK: Leg
class VisualizedLeg(Serializable):
    assigned_vehicle_id: str | None
    boarding_stop_index: int | None
    alighting_stop_index: int | None
    boarding_time: float | None
    alighting_time: float | None
    assigned_time: float | None
    tags: list[str]

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        assigned_vehicle_id: str | None,
        boarding_stop_index: int | None,
        alighting_stop_index: int | None,
        boarding_time: float | None,
        alighting_time: float | None,
        assigned_time: float | None,
        tags: list[str],
    ) -> None:
        self.assigned_vehicle_id = assigned_vehicle_id
        self.boarding_stop_index = boarding_stop_index
        self.alighting_stop_index = alighting_stop_index
        self.boarding_time = boarding_time
        self.alighting_time = alighting_time
        self.assigned_time = assigned_time
        self.tags = tags

    @classmethod
    def from_leg_environment_and_trip(  # pylint: disable=too-many-locals, too-many-branches
        cls,
        leg: Leg,
        environment: Environment,
        trip: Trip,
        previous_leg: Leg | None = None,
    ) -> "VisualizedLeg":
        boarding_stop_index = None
        alighting_stop_index = None

        route = (
            environment.get_route_by_vehicle_id(leg.assigned_vehicle.id) if leg.assigned_vehicle is not None else None
        )

        all_legs = trip.previous_legs + ([trip.current_leg] if trip.current_leg else []) + trip.next_legs

        same_vehicle_leg_index = 0
        for i, other_leg in enumerate(all_legs):
            if other_leg.assigned_vehicle == leg.assigned_vehicle:
                if other_leg == leg:
                    break
                same_vehicle_leg_index += 1

        if route is not None:
            all_stops = route.previous_stops.copy()
            if route.current_stop is not None:
                all_stops.append(route.current_stop)
            all_stops += route.next_stops

            trip_found_count = 0

            for i, stop in enumerate(all_stops):
                if boarding_stop_index is None and trip in (
                    stop.passengers_to_board + stop.boarding_passengers + stop.boarded_passengers
                ):
                    if trip_found_count == same_vehicle_leg_index:
                        boarding_stop_index = i
                        break
                    trip_found_count += 1

            trip_found_count = 0

            for i, stop in enumerate(all_stops):
                if alighting_stop_index is None and trip in (
                    stop.passengers_to_alight + stop.alighting_passengers + stop.alighted_passengers
                ):
                    if trip_found_count == same_vehicle_leg_index:
                        alighting_stop_index = i
                        break
                    trip_found_count += 1

        assigned_vehicle_id = leg.assigned_vehicle.id if leg.assigned_vehicle is not None else None

        assigned_time = None
        if assigned_vehicle_id is not None:
            if previous_leg is not None and previous_leg.assigned_time is not None:
                assigned_time = previous_leg.assigned_time
            else:
                assigned_time = environment.current_time

        return cls(
            assigned_vehicle_id,
            boarding_stop_index,
            alighting_stop_index,
            leg.boarding_time,
            leg.alighting_time,
            assigned_time,
            leg.tags,
        )

    def serialize(self) -> dict:
        serialized = {}

        if self.assigned_vehicle_id is not None:
            serialized["assignedVehicleId"] = self.assigned_vehicle_id

        if self.boarding_stop_index is not None:
            serialized["boardingStopIndex"] = self.boarding_stop_index

        if self.alighting_stop_index is not None:
            serialized["alightingStopIndex"] = self.alighting_stop_index

        if self.boarding_time is not None:
            serialized["boardingTime"] = self.boarding_time

        if self.alighting_time is not None:
            serialized["alightingTime"] = self.alighting_time
        if self.assigned_time is not None:
            serialized["assignedTime"] = self.assigned_time

        if len(self.tags) > 0:
            serialized["tags"] = self.tags

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedLeg":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        assigned_vehicle_id = data.get("assignedVehicleId", None)
        boarding_stop_index = data.get("boardingStopIndex", None)
        alighting_stop_index = data.get("alightingStopIndex", None)
        boarding_time = data.get("boardingTime", None)
        alighting_time = data.get("alightingTime", None)
        assigned_time = data.get("assignedTime", None)
        tags = data.get("tags", [])

        return VisualizedLeg(
            assigned_vehicle_id,
            boarding_stop_index,
            alighting_stop_index,
            boarding_time,
            alighting_time,
            assigned_time,
            tags,
        )


# MARK: Passenger
class VisualizedPassenger(Serializable):  # pylint: disable=too-many-instance-attributes
    passenger_id: str
    name: str | None
    status: PassengerStatus
    number_of_passengers: int

    previous_legs: list[VisualizedLeg]
    current_leg: VisualizedLeg | None
    next_legs: list[VisualizedLeg]

    tags: list[str]

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        passenger_id: str,
        name: str | None,
        status: PassengerStatus,
        number_of_passengers: int,
        previous_legs: list[VisualizedLeg],
        current_leg: VisualizedLeg | None,
        next_legs: list[VisualizedLeg],
        tags: list[str],
    ) -> None:
        self.passenger_id = passenger_id
        self.name = name
        self.status = status
        self.number_of_passengers = number_of_passengers

        self.previous_legs = previous_legs
        self.current_leg = current_leg
        self.next_legs = next_legs

        self.tags = tags

    @classmethod
    def from_trip_and_environment(cls, trip: Trip, environment: Environment) -> "VisualizedPassenger":
        previous_legs = [
            VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip) for leg in trip.previous_legs
        ]
        current_leg = (
            VisualizedLeg.from_leg_environment_and_trip(trip.current_leg, environment, trip)
            if trip.current_leg is not None
            else None
        )
        next_legs = [VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip) for leg in trip.next_legs]

        return cls(
            trip.id, trip.name, trip.status, trip.nb_passengers, previous_legs, current_leg, next_legs, trip.tags
        )

    def serialize(self) -> dict:
        serialized = {
            "id": self.passenger_id,
            "status": convert_passenger_status_to_string(self.status),
            "numberOfPassengers": self.number_of_passengers,
        }

        if self.name is not None:
            serialized["name"] = self.name

        serialized["previousLegs"] = [leg.serialize() for leg in self.previous_legs]

        if self.current_leg is not None:
            serialized["currentLeg"] = self.current_leg.serialize()

        serialized["nextLegs"] = [leg.serialize() for leg in self.next_legs]

        if len(self.tags) > 0:
            serialized["tags"] = self.tags

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedPassenger":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if (
            "id" not in data
            or "status" not in data
            or "previousLegs" not in data
            or "nextLegs" not in data
            or "numberOfPassengers" not in data
        ):
            raise ValueError("Invalid data for VisualizedPassenger")

        passenger_id = str(data["id"])
        name = data.get("name", None)
        status = convert_string_to_passenger_status(data["status"])
        number_of_passengers = int(data["numberOfPassengers"])

        previous_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in data["previousLegs"]]
        next_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in data["nextLegs"]]

        current_leg = data.get("currentLeg", None)
        if current_leg is not None:
            current_leg = VisualizedLeg.deserialize(current_leg)

        tags = data.get("tags", [])

        return VisualizedPassenger(
            passenger_id, name, status, number_of_passengers, previous_legs, current_leg, next_legs, tags
        )


# MARK: Stop
class VisualizedStop(Serializable):
    arrival_time: float
    departure_time: float | None
    latitude: float | None
    longitude: float | None
    capacity: int | None
    label: str
    tags: list[str]

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        arrival_time: float,
        departure_time: float,
        latitude: float | None,
        longitude: float | None,
        capacity: int | None,
        label: str,
        tags: str,
    ) -> None:
        self.arrival_time = arrival_time
        self.departure_time = departure_time
        self.latitude = latitude
        self.longitude = longitude
        self.capacity = capacity
        self.label = label
        self.tags = tags

    @classmethod
    def from_stop(cls, stop: Stop) -> "VisualizedStop":
        return cls(
            stop.arrival_time,
            stop.departure_time if stop.departure_time != math.inf else None,
            stop.location.lat,
            stop.location.lon,
            stop.capacity,
            stop.location.label,
            stop.tags,
        )

    def serialize(self) -> dict:
        serialized = {"arrivalTime": self.arrival_time}

        if self.departure_time is not None:
            serialized["departureTime"] = self.departure_time

        if self.latitude is not None and self.longitude is not None:
            serialized["position"] = {
                "latitude": self.latitude,
                "longitude": self.longitude,
            }

        if self.capacity is not None:
            serialized["capacity"] = self.capacity

        serialized["label"] = self.label

        if len(self.tags) > 0:
            serialized["tags"] = self.tags

        return serialized

    @staticmethod
    def deserialize(data: str) -> "VisualizedStop":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "arrivalTime" not in data or "label" not in data:
            raise ValueError("Invalid data for VisualizedStop")

        arrival_time = float(data["arrivalTime"])
        departure_time = data.get("departureTime", None)

        latitude = None
        longitude = None

        position = data.get("position", None)

        if position is not None:
            latitude = position.get("latitude", None)
            longitude = position.get("longitude", None)

        capacity = data.get("capacity", None)

        if capacity is not None:
            capacity = int(capacity)

        label = data["label"]

        tags = data.get("tags", [])

        return VisualizedStop(arrival_time, departure_time, latitude, longitude, capacity, label, tags)


# MARK: Vehicle
class VisualizedVehicle(Serializable):  # pylint: disable=too-many-instance-attributes
    vehicle_id: str
    mode: str | None
    status: VehicleStatus
    polylines: dict[str, tuple[str, list[float]]] | None
    previous_stops: list[VisualizedStop]
    current_stop: VisualizedStop | None
    next_stops: list[VisualizedStop]
    capacity: int
    name: str | None
    tags: list[str]

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        vehicle_id: str | int,
        mode: str | None,
        status: VehicleStatus,
        polylines: dict[str, tuple[str, list[float]]] | None,
        previous_stops: list[VisualizedStop],
        current_stop: VisualizedStop | None,
        next_stops: list[VisualizedStop],
        capacity: int,
        name: str | None,
        tags: list[str],
    ) -> None:
        self.vehicle_id = str(vehicle_id)
        self.mode = mode
        self.status = status
        self.polylines = polylines

        self.previous_stops = previous_stops
        self.current_stop = current_stop
        self.next_stops = next_stops

        self.capacity = capacity
        self.name = name

        self.tags = tags

    @property
    def all_stops(self) -> list[VisualizedStop]:
        return self.previous_stops + ([self.current_stop] if self.current_stop is not None else []) + self.next_stops

    @classmethod
    def from_vehicle_and_route(cls, vehicle: Vehicle, route: Route) -> "VisualizedVehicle":
        previous_stops = [VisualizedStop.from_stop(stop) for stop in route.previous_stops]
        current_stop = VisualizedStop.from_stop(route.current_stop) if route.current_stop is not None else None
        next_stops = [VisualizedStop.from_stop(stop) for stop in route.next_stops]
        return cls(
            vehicle.id,
            vehicle.mode,
            vehicle.status,
            vehicle.polylines,
            previous_stops,
            current_stop,
            next_stops,
            vehicle.capacity,
            vehicle.name,
            vehicle.tags,
        )

    def serialize(self) -> dict:
        serialized = {
            "id": self.vehicle_id,
            "status": convert_vehicle_status_to_string(self.status),
            "previousStops": [stop.serialize() for stop in self.previous_stops],
            "nextStops": [stop.serialize() for stop in self.next_stops],
            "capacity": self.capacity,
            "name": self.name,
        }

        if self.mode is not None:
            serialized["mode"] = self.mode

        if self.current_stop is not None:
            serialized["currentStop"] = self.current_stop.serialize()

        if len(self.tags) > 0:
            serialized["tags"] = self.tags

        return serialized

    @staticmethod
    def deserialize(data: str | dict) -> "VisualizedVehicle":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        required_keys = [
            "id",
            "status",
            "previousStops",
            "nextStops",
            "capacity",
            "name",
        ]
        if any(key not in data for key in required_keys):
            raise ValueError("Invalid data for VisualizedVehicle")

        vehicle_id = str(data["id"])
        mode = data.get("mode", None)
        status = convert_string_to_vehicle_status(data["status"])
        previous_stops = [VisualizedStop.deserialize(stop_data) for stop_data in data["previousStops"]]
        next_stops = [VisualizedStop.deserialize(stop_data) for stop_data in data["nextStops"]]
        capacity = int(data["capacity"])
        name = data.get("name", None)

        current_stop = data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        tags = data.get("tags", [])

        return VisualizedVehicle(
            vehicle_id, mode, status, None, previous_stops, current_stop, next_stops, capacity, name, tags
        )


# MARK: Environment
class VisualizedEnvironment(Serializable):
    passengers: dict[str, VisualizedPassenger]
    vehicles: dict[str, VisualizedVehicle]
    statistic: dict[str, dict[str, dict[str, int]]]
    timestamp: float
    estimated_end_time: float
    order: int

    def __init__(self) -> None:
        self.passengers = {}
        self.vehicles = {}
        self.timestamp = 0
        self.estimated_end_time = 0
        self.order = 0
        self.statistic = None

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
            "passengers": [passenger.serialize() for passenger in self.passengers.values()],
            "vehicles": [vehicle.serialize() for vehicle in self.vehicles.values()],
            "timestamp": self.timestamp,
            "estimatedEndTime": self.estimated_end_time,
            "statistic": self.statistic if self.statistic is not None else {},
            "order": self.order,
        }

    @staticmethod
    def deserialize(data: str) -> "VisualizedEnvironment":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        required_keys = [
            "passengers",
            "vehicles",
            "timestamp",
            "estimatedEndTime",
            "statistic",
            "order",
        ]
        if any(key not in data for key in required_keys):
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
        environment.statistic = data["statistic"]
        environment.order = data["order"]

        return environment


# MARK: Updates
class UpdateType(Enum):
    CREATE_PASSENGER = "createPassenger"
    CREATE_VEHICLE = "createVehicle"
    UPDATE_PASSENGER_STATUS = "updatePassengerStatus"
    UPDATE_PASSENGER_LEGS = "updatePassengerLegs"
    UPDATE_VEHICLE_STATUS = "updateVehicleStatus"
    UPDATE_VEHICLE_STOPS = "updateVehicleStops"
    UPDATE_STATISTIC = "updateStatistic"


class StatisticUpdate(Serializable):
    statistic: dict[str, dict[str, dict[str, int]]]

    def __init__(self, statistic: dict) -> None:
        self.statistic = statistic

    def serialize(self) -> dict[str, dict[str, dict[str, int]]]:
        return {"statistic": self.statistic}

    @staticmethod
    def deserialize(data: str) -> "StatisticUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "statistic" not in data:
            raise ValueError("Invalid data for StatisticUpdate")

        return StatisticUpdate(data.statistic)


class PassengerStatusUpdate(Serializable):
    passenger_id: str
    status: PassengerStatus

    def __init__(self, passenger_id: str, status: PassengerStatus) -> None:
        self.passenger_id = passenger_id
        self.status = status

    @classmethod
    def from_trip(cls, trip: Trip) -> "PassengerStatusUpdate":
        return cls(trip.id, trip.status)

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


class PassengerLegsUpdate(Serializable):
    passenger_id: str
    previous_legs: list[VisualizedLeg]
    current_leg: VisualizedLeg | None
    next_legs: list[VisualizedLeg]

    def __init__(
        self,
        passenger_id: str,
        previous_legs: list[VisualizedLeg],
        current_leg: VisualizedLeg | None,
        next_legs: list[VisualizedLeg],
    ) -> None:
        self.passenger_id = passenger_id
        self.previous_legs = previous_legs
        self.current_leg = current_leg
        self.next_legs = next_legs

    @classmethod
    def from_trip_environment_and_previous_passenger(
        cls,
        trip: Trip,
        environment: Environment,
        previous_passenger: VisualizedPassenger,
    ) -> "PassengerLegsUpdate":
        all_previous_legs = (
            previous_passenger.previous_legs
            + ([previous_passenger.current_leg] if previous_passenger.current_leg is not None else [])
            + previous_passenger.next_legs
        )
        current_index = 0

        previous_legs = []
        for leg in trip.previous_legs:
            previous_leg = None
            if current_index < len(all_previous_legs):
                previous_leg = all_previous_legs[current_index]
                current_index += 1
            previous_legs.append(VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip, previous_leg))

        previous_leg = None
        if trip.current_leg is not None and current_index < len(all_previous_legs):
            previous_leg = all_previous_legs[current_index]
            current_index += 1
        current_leg = (
            VisualizedLeg.from_leg_environment_and_trip(trip.current_leg, environment, trip, previous_leg)
            if trip.current_leg is not None
            else None
        )

        next_legs = []
        for leg in trip.next_legs:
            next_leg = None
            if current_index < len(all_previous_legs):
                next_leg = all_previous_legs[current_index]
                current_index += 1
            next_legs.append(VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip, next_leg))

        return cls(trip.id, previous_legs, current_leg, next_legs)

    def serialize(self) -> dict:
        serialized = {
            "id": self.passenger_id,
            "previousLegs": [leg.serialize() for leg in self.previous_legs],
            "nextLegs": [leg.serialize() for leg in self.next_legs],
        }

        if self.current_leg is not None:
            serialized["currentLeg"] = self.current_leg.serialize()

        return serialized

    @staticmethod
    def deserialize(data: str) -> "PassengerLegsUpdate":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "id" not in data or "previousLegs" not in data or "nextLegs" not in data:
            raise ValueError("Invalid data for PassengerLegsUpdate")

        passenger_id = str(data["id"])
        previous_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in data["previousLegs"]]
        next_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in data["nextLegs"]]

        current_leg = data.get("currentLeg", None)
        if current_leg is not None:
            current_leg = VisualizedLeg.deserialize(current_leg)

        return PassengerLegsUpdate(passenger_id, previous_legs, current_leg, next_legs)


class VehicleStatusUpdate(Serializable):
    vehicle_id: str
    status: VehicleStatus

    def __init__(self, vehicle_id: str, status: VehicleStatus) -> None:
        self.vehicle_id = vehicle_id
        self.status = status

    @classmethod
    def from_vehicle(cls, vehicle: Vehicle) -> "VehicleStatusUpdate":
        return cls(vehicle.id, vehicle.status)

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
    def from_vehicle_and_route(cls, vehicle: Vehicle, route: Route) -> "VehicleStopsUpdate":
        previous_stops = [VisualizedStop.from_stop(stop) for stop in route.previous_stops]
        current_stop = VisualizedStop.from_stop(route.current_stop) if route.current_stop is not None else None
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
        previous_stops = [VisualizedStop.deserialize(stop_data) for stop_data in data["previousStops"]]
        next_stops = [VisualizedStop.deserialize(stop_data) for stop_data in data["nextStops"]]

        current_stop = data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        return VehicleStopsUpdate(vehicle_id, previous_stops, current_stop, next_stops)


class Update(Serializable):
    update_type: UpdateType
    data: Serializable
    timestamp: float
    order: int

    def __init__(
        self,
        update_type: UpdateType,
        data: Serializable,
        timestamp: float,
    ) -> None:
        self.update_type = update_type
        self.data = data
        self.timestamp = timestamp
        self.order = 0

    def serialize(self) -> dict:
        return {
            "type": self.update_type.value,
            "data": self.data.serialize(),
            "timestamp": self.timestamp,
            "order": self.order,
        }

    @staticmethod
    def deserialize(data: str) -> "Update":
        if isinstance(data, str):
            data = json.loads(data.replace("'", '"'))

        if "type" not in data or "data" not in data or "timestamp" not in data or "order" not in data:
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
        elif update_type == UpdateType.UPDATE_PASSENGER_LEGS:
            update_data = PassengerLegsUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STATUS:
            update_data = VehicleStatusUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STOPS:
            update_data = VehicleStopsUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_STATISTIC:
            update_data = StatisticUpdate.deserialize(update_data)

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
class SimulationInformation(Serializable):  # pylint: disable=too-many-instance-attributes
    version: int
    simulation_id: str
    name: str
    start_time: str
    data: str
    simulation_start_time: float | None
    simulation_end_time: float | None
    last_update_order: int | None

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
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

        self.name = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)[1]
        self.start_time = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)[0]
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
class SimulationVisualizationDataManager:  # pylint: disable=too-many-public-methods
    """
    This class manage reads and writes of simulation data for visualization.
    """

    __CORRUPTED_FILE_NAME = ".corrupted"
    __SAVED_SIMULATIONS_DIRECTORY_NAME = "saved_simulations"
    __SIMULATION_INFORMATION_FILE_NAME = "simulation_information.json"
    __STATES_DIRECTORY_NAME = "states"
    __POLYLINES_DIRECTORY_NAME = "polylines"
    __POLYLINES_FILE_NAME = "polylines"
    __POLYLINES_VERSION_FILE_NAME = "version"

    __STATES_ORDER_MINIMUM_LENGTH = 8
    __STATES_TIMESTAMP_MINIMUM_LENGTH = 8

    # Only send a maximum of __MAX_STATES_AT_ONCE states at once
    # This should be at least 2
    __MAX_STATES_AT_ONCE = 2

    # The client keeps a maximum of __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY + __MAX_STATES_IN_CLIENT_AFTER_NECESSARY + 1
    # states in memory
    # The current one, the previous __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY and
    # the next __MAX_STATES_IN_CLIENT_AFTER_NECESSARY
    # __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY = 24
    # __MAX_STATES_IN_CLIENT_AFTER_NECESSARY = 50

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
        directory_path = os.path.join(
            get_data_directory_path(), SimulationVisualizationDataManager.__SAVED_SIMULATIONS_DIRECTORY_NAME
        )

        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        return directory_path

    @staticmethod
    def get_all_saved_simulation_ids() -> list[str]:
        directory_path = SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        return os.listdir(directory_path)

    @staticmethod
    def get_saved_simulation_directory_path(simulation_id: str, should_create=False) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        simulation_directory_path = f"{directory_path}/{simulation_id}"

        if should_create and not os.path.exists(simulation_directory_path):
            os.makedirs(simulation_directory_path)

        return simulation_directory_path

    # MARK: +- Folder size
    @staticmethod
    def _get_folder_size(start_path: str) -> int:
        total_size = 0
        for directory_path, _, file_names in os.walk(start_path):
            file_names = [name for name in file_names if not name.endswith(".lock")]
            for file_name in file_names:
                file_path = os.path.join(directory_path, file_name)
                lock = FileLock(f"{file_path}.lock")
                with lock:
                    total_size += os.path.getsize(file_path)
        return total_size

    @staticmethod
    def get_saved_simulation_size(simulation_id: str) -> int:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id
        )
        return SimulationVisualizationDataManager._get_folder_size(simulation_directory_path)

    # MARK: +- Corrupted
    @staticmethod
    def is_simulation_corrupted(simulation_id: str) -> bool:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )

        return os.path.exists(f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}")

    @staticmethod
    def mark_simulation_as_corrupted(simulation_id: str) -> None:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )

        file_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}"

        with open(file_path, "w", encoding="utf-8") as file:
            file.write("")

    # MARK: +- Simulation Information
    @staticmethod
    def get_saved_simulation_information_file_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        file_path = (
            f"{simulation_directory_path}/{SimulationVisualizationDataManager.__SIMULATION_INFORMATION_FILE_NAME}"
        )

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_simulation_information(simulation_id: str, simulation_information: SimulationInformation) -> None:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(simulation_id)

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_readable(simulation_information.serialize(), file)

    @staticmethod
    def get_simulation_information(simulation_id: str) -> SimulationInformation:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(simulation_id)

        lock = FileLock(f"{file_path}.lock")

        simulation_information = None
        should_update_simulation_information = False

        with lock:
            with open(file_path, "r", encoding="utf-8") as file:
                data = file.read()

                simulation_information = SimulationInformation.deserialize(data)

                # Handle mismatched simulation_id, name, or start_time because of uploads
                # where the simulation folder has been renamed due to duplicates.
                start_time, name = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)

                if (
                    simulation_id != simulation_information.simulation_id
                    or name != simulation_information.name
                    or start_time != simulation_information.start_time
                ):
                    simulation_information.simulation_id = simulation_id
                    simulation_information.name = name
                    simulation_information.start_time = start_time

        if simulation_information is not None and should_update_simulation_information:
            SimulationVisualizationDataManager.set_simulation_information(simulation_id, simulation_information)

        return simulation_information

    # MARK: +- States and updates
    @staticmethod
    def get_saved_simulation_states_folder_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        folder_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__STATES_DIRECTORY_NAME}"

        if not os.path.exists(folder_path):
            os.makedirs(folder_path)

        return folder_path

    @staticmethod
    def get_saved_simulation_state_file_path(simulation_id: str, order: int, timestamp: float) -> str:
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(simulation_id)

        padded_order = str(order).zfill(SimulationVisualizationDataManager.__STATES_ORDER_MINIMUM_LENGTH)
        padded_timestamp = str(int(timestamp)).zfill(
            SimulationVisualizationDataManager.__STATES_TIMESTAMP_MINIMUM_LENGTH
        )

        # States and updates are stored in a .jsonl file to speed up reads and writes
        # Each line is a state (the first line) or an update (the following lines)
        file_path = f"{folder_path}/{padded_order}-{padded_timestamp}.jsonl"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def get_sorted_states(simulation_id: str) -> list[tuple[int, float]]:
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(simulation_id)

        all_states_files = [
            path for path in os.listdir(folder_path) if path.endswith(".jsonl")
        ]  # Filter out lock files

        states = []
        for state_file in all_states_files:
            order, timestamp = state_file.split("-")
            states.append((int(order), float(timestamp.split(".")[0])))

        return sorted(states, key=lambda x: (x[1], x[0]))

    @staticmethod
    def save_state(simulation_id: str, environment: VisualizedEnvironment) -> str:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
            simulation_id, environment.order, environment.timestamp
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_one_line(environment.serialize(), file)

        return file_path

    @staticmethod
    def save_update(file_path: str, update: Update) -> None:
        lock = FileLock(f"{file_path}.lock")
        with lock:
            with open(file_path, "a", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_one_line(update.serialize(), file)

    @staticmethod
    def get_missing_states(  # pylint: disable=too-many-locals, too-many-branches, too-many-statements
        simulation_id: str,
        visualization_time: float,
        loaded_state_orders: list[int],
        is_simulation_complete: bool,
    ) -> tuple[list[str], dict[list[str]], list[int], bool, int, int, int]:
        sorted_states = SimulationVisualizationDataManager.get_sorted_states(simulation_id)

        if len(sorted_states) == 0:
            return ([], {}, [], False, 0, 0, 0)

        necessary_state_index = None

        for index, (order, state_timestamp) in enumerate(sorted_states):
            if necessary_state_index is None and state_timestamp > visualization_time:
                necessary_state_index = index
                break

        if necessary_state_index is None:
            # If the visualization time is after the last state then
            # The last state is necessary
            necessary_state_index = len(sorted_states) - 1
        else:
            # Else we need the state before the first state with greater timestamp
            necessary_state_index -= 1

        # Handle negative indexes
        necessary_state_index = max(0, necessary_state_index)

        state_orders_to_keep = []
        missing_states = []
        missing_updates = {}

        last_state_index_in_client = -1
        all_state_indexes_in_client = []

        # We want to load the necessary state first, followed by
        # the __MAX_STATES_IN_CLIENT_AFTER_NECESSARY next states and
        # then the __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY previous states
        indexes_to_load = (
            [necessary_state_index]
            # + [
            #     next_state_index
            #     for next_state_index in range(
            #         necessary_state_index + 1,
            #         min(
            #             necessary_state_index
            #             + SimulationVisualizationDataManager.__MAX_STATES_IN_CLIENT_AFTER_NECESSARY
            #             + 1,
            #             len(sorted_states),
            #         ),
            #     )
            # ]
            # + [
            #     previous_state_index
            #     for previous_state_index in range(
            #         necessary_state_index - 1,
            #         max(
            #             necessary_state_index
            #             - SimulationVisualizationDataManager.__MAX_STATES_IN_CLIENT_BEFORE_NECESSARY
            #             - 1,
            #             -1,
            #         ),
            #         -1,
            #     )
            # ]
            # All next states
            + list(range(necessary_state_index + 1, len(sorted_states)))
            # All previous states
            + list(range(necessary_state_index - 1, -1, -1))
        )

        for index in indexes_to_load:
            order, state_timestamp = sorted_states[index]

            # If the client already has the state, skip it
            # except the last state that might have changed
            if order in loaded_state_orders and not order == max(loaded_state_orders):
                state_orders_to_keep.append(order)

                all_state_indexes_in_client.append(index)

                last_state_index_in_client = max(last_state_index_in_client, index)

                continue

            # Don't add states if the max number of states is reached
            # but continue the loop to know which states need to be kept
            if len(missing_states) >= SimulationVisualizationDataManager.__MAX_STATES_AT_ONCE:
                continue

            state_file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                simulation_id, order, state_timestamp
            )

            lock = FileLock(f"{state_file_path}.lock")

            with lock:
                with open(state_file_path, "r", encoding="utf-8") as file:
                    environment_data = file.readline()
                    missing_states.append(environment_data)

                    updates_data = file.readlines()
                    current_state_updates = []
                    for update_data in updates_data:
                        current_state_updates.append(update_data)

                    missing_updates[order] = current_state_updates

                    all_state_indexes_in_client.append(index)

                    last_state_index_in_client = max(last_state_index_in_client, index)

        client_has_last_state = last_state_index_in_client == len(sorted_states) - 1
        client_has_max_states = len(missing_states) + len(state_orders_to_keep) >= len(indexes_to_load)

        should_request_more_states = (is_simulation_complete and not client_has_max_states) or (
            not is_simulation_complete and (client_has_last_state or not client_has_max_states)
        )

        first_continuous_state_index = necessary_state_index
        last_continuous_state_index = necessary_state_index

        all_state_indexes_in_client.sort()

        necessary_state_index_index = all_state_indexes_in_client.index(necessary_state_index)

        for index in range(necessary_state_index_index - 1, -1, -1):
            if all_state_indexes_in_client[index] == first_continuous_state_index - 1:
                first_continuous_state_index -= 1
            else:
                break

        for index in range(necessary_state_index_index + 1, len(all_state_indexes_in_client)):
            if all_state_indexes_in_client[index] == last_continuous_state_index + 1:
                last_continuous_state_index += 1
            else:
                break

        first_continuous_state_order = sorted_states[first_continuous_state_index][0]
        last_continuous_state_order = sorted_states[last_continuous_state_index][0]

        necessary_state_order = sorted_states[necessary_state_index][0]

        return (
            missing_states,
            missing_updates,
            state_orders_to_keep,
            should_request_more_states,
            first_continuous_state_order,
            last_continuous_state_order,
            necessary_state_order,
        )

    # MARK: +- Polylines

    # The polylines are saved with the following structure :
    # polylines/
    #   version
    #   polylines.jsonl
    #     { "coordinatesString": "string", "encodedPolyline": "string", "coefficients": [float] }

    @staticmethod
    def get_saved_simulation_polylines_lock(simulation_id: str) -> FileLock:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        return FileLock(f"{simulation_directory_path}/polylines.lock")

    @staticmethod
    def get_saved_simulation_polylines_directory_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        directory_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__POLYLINES_DIRECTORY_NAME}"

        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        return directory_path

    @staticmethod
    def get_saved_simulation_polylines_version_file_path(simulation_id: str) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_directory_path(simulation_id)
        file_path = f"{directory_path}/{SimulationVisualizationDataManager.__POLYLINES_VERSION_FILE_NAME}"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write(str(0))

        return file_path

    @staticmethod
    def set_polylines_version(simulation_id: str, version: int) -> None:
        """
        Should always be called in a lock.
        """
        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_version_file_path(simulation_id)

        with open(file_path, "w", encoding="utf-8") as file:
            file.write(str(version))

    @staticmethod
    def get_polylines_version(simulation_id: str) -> int:
        """
        Should always be called in a lock.
        """
        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_version_file_path(simulation_id)

        with open(file_path, "r", encoding="utf-8") as file:
            return int(file.read())

    @staticmethod
    def get_polylines_version_with_lock(simulation_id: str) -> int:
        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)
        with lock:
            return SimulationVisualizationDataManager.get_polylines_version(simulation_id)

    @staticmethod
    def get_saved_simulation_polylines_file_path(simulation_id: str) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_directory_path(simulation_id)

        file_path = f"{directory_path}/{SimulationVisualizationDataManager.__POLYLINES_FILE_NAME}.jsonl"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_polylines(simulation_id: str, polylines: dict[str, tuple[str, list[float]]]) -> None:

        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(simulation_id)

        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)

        with lock:
            # Increment the version to notify the client that the polylines have changed
            version = SimulationVisualizationDataManager.get_polylines_version(simulation_id)
            version += 1
            SimulationVisualizationDataManager.set_polylines_version(simulation_id, version)

            with open(file_path, "a", encoding="utf-8") as file:
                for coordinates_string, (
                    encoded_polyline,
                    coefficients,
                ) in polylines.items():
                    data = {
                        "coordinatesString": coordinates_string,
                        "encodedPolyline": encoded_polyline,
                        "coefficients": coefficients,
                    }
                    SimulationVisualizationDataManager.__format_json_one_line(data, file)

    @staticmethod
    def get_polylines(
        simulation_id: str,
    ) -> tuple[list[str], int]:

        polylines = []

        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)

        version = 0

        with lock:
            version = SimulationVisualizationDataManager.get_polylines_version(simulation_id)

            file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(simulation_id)

            with open(file_path, "r", encoding="utf-8") as file:
                for line in file:
                    polylines.append(line)

        return polylines, version
