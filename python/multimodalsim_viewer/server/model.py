# pylint: disable=too-many-lines
import math
from enum import Enum

import multimodalsim.optimization.dispatcher  # (To avoid circular import error) pylint: disable=unused-import
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.request import Leg, Trip
from multimodalsim.simulator.stop import Stop
from multimodalsim.simulator.vehicle import Route, Vehicle
from multimodalsim.state_machine.status import PassengerStatus, VehicleStatus

from multimodalsim_viewer.common.utils import (
    SAVE_VERSION,
    SIMULATION_SAVE_FILE_SEPARATOR,
    Serializable,
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


# MARK: LegType
class LegType(Enum):
    PREVIOUS = "previous"
    CURRENT = "current"
    NEXT = "next"


# MARK: Leg
class VisualizedLeg(Serializable):  # pylint: disable=too-many-instance-attributes

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        assigned_vehicle_id: str | None,
        boarding_stop_index: int | None,
        alighting_stop_index: int | None,
        boarding_time: float | None,
        alighting_time: float | None,
        tags: list[str],
        leg_type: LegType,
    ) -> None:
        self.assigned_vehicle_id = assigned_vehicle_id
        self.boarding_stop_index = boarding_stop_index
        self.alighting_stop_index = alighting_stop_index
        self.boarding_time = boarding_time
        self.alighting_time = alighting_time
        self.tags = tags
        self.leg_type: LegType = leg_type

    @classmethod
    def from_leg_environment_and_trip(  # pylint: disable=too-many-locals, too-many-branches, too-many-arguments, too-many-positional-arguments
        cls,
        leg: Leg,
        environment: Environment,
        trip: Trip,
        leg_type: LegType,
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

        return cls(
            assigned_vehicle_id,
            boarding_stop_index,
            alighting_stop_index,
            leg.boarding_time,
            leg.alighting_time,
            leg.tags,
            leg_type,
        )

    def serialize(self) -> dict:
        serialized = {}

        serialized["legType"] = self.leg_type.value

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

        if len(self.tags) > 0:
            serialized["tags"] = self.tags

        return serialized

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedLeg":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_keys = ["legType"]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedLeg")

        assigned_vehicle_id = serialized_data.get("assignedVehicleId", None)
        boarding_stop_index = serialized_data.get("boardingStopIndex", None)
        alighting_stop_index = serialized_data.get("alightingStopIndex", None)
        boarding_time = serialized_data.get("boardingTime", None)
        alighting_time = serialized_data.get("alightingTime", None)
        tags = serialized_data.get("tags", [])
        leg_type = serialized_data.get("legType")

        return cls(
            assigned_vehicle_id,
            boarding_stop_index,
            alighting_stop_index,
            boarding_time,
            alighting_time,
            tags,
            LegType(leg_type),
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
            VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip, LegType.PREVIOUS)
            for leg in trip.previous_legs
        ]
        current_leg = (
            VisualizedLeg.from_leg_environment_and_trip(trip.current_leg, environment, trip, LegType.CURRENT)
            if trip.current_leg is not None
            else None
        )
        next_legs = [
            VisualizedLeg.from_leg_environment_and_trip(leg, environment, trip, LegType.NEXT) for leg in trip.next_legs
        ]

        return cls(
            trip.id, trip.name, trip.status, trip.nb_passengers, previous_legs, current_leg, next_legs, trip.tags
        )

    @property
    def all_legs(self) -> list[VisualizedLeg]:
        """
        Returns all legs of the passenger, including previous, current, and next legs.
        """
        return self.previous_legs + ([self.current_leg] if self.current_leg is not None else []) + self.next_legs

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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedPassenger":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if (
            "id" not in serialized_data
            or "status" not in serialized_data
            or "previousLegs" not in serialized_data
            or "nextLegs" not in serialized_data
            or "numberOfPassengers" not in serialized_data
        ):
            raise ValueError("Invalid data for VisualizedPassenger")

        passenger_id = str(serialized_data["id"])
        name = serialized_data.get("name", None)
        status = convert_string_to_passenger_status(serialized_data["status"])
        number_of_passengers = int(serialized_data["numberOfPassengers"])

        previous_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in serialized_data["previousLegs"]]
        next_legs = [VisualizedLeg.deserialize(leg_data) for leg_data in serialized_data["nextLegs"]]

        current_leg = serialized_data.get("currentLeg", None)
        if current_leg is not None:
            current_leg = VisualizedLeg.deserialize(current_leg)

        tags = serialized_data.get("tags", [])

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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedStop":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "arrivalTime" not in serialized_data or "label" not in serialized_data:
            raise ValueError("Invalid data for VisualizedStop")

        arrival_time = float(serialized_data["arrivalTime"])
        departure_time = serialized_data.get("departureTime", None)

        latitude = None
        longitude = None

        position = serialized_data.get("position", None)

        if position is not None:
            latitude = position.get("latitude", None)
            longitude = position.get("longitude", None)

        capacity = serialized_data.get("capacity", None)

        if capacity is not None:
            capacity = int(capacity)

        label = serialized_data["label"]

        tags = serialized_data.get("tags", [])

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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedVehicle":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_keys = [
            "id",
            "status",
            "previousStops",
            "nextStops",
            "capacity",
            "name",
        ]
        if any(key not in serialized_data for key in required_keys):
            raise ValueError("Invalid data for VisualizedVehicle")

        vehicle_id = str(serialized_data["id"])
        mode = serialized_data.get("mode", None)
        status = convert_string_to_vehicle_status(serialized_data["status"])
        previous_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["previousStops"]]
        next_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["nextStops"]]
        capacity = int(serialized_data["capacity"])
        name = serialized_data.get("name", None)

        current_stop = serialized_data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        tags = serialized_data.get("tags", [])

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

    def get_passenger(self, passenger_id: str) -> VisualizedPassenger | None:
        if passenger_id in self.passengers:
            return self.passengers[passenger_id]
        return None

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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedEnvironment":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_keys = [
            "passengers",
            "vehicles",
            "timestamp",
            "estimatedEndTime",
            "statistic",
            "order",
        ]
        if any(key not in serialized_data for key in required_keys):
            raise ValueError("Invalid data for VisualizedEnvironment")

        environment = VisualizedEnvironment()
        for passenger_data in serialized_data["passengers"]:
            passenger = VisualizedPassenger.deserialize(passenger_data)
            environment.add_passenger(passenger)

        for vehicle_data in serialized_data["vehicles"]:
            vehicle = VisualizedVehicle.deserialize(vehicle_data)
            environment.add_vehicle(vehicle)

        environment.timestamp = serialized_data["timestamp"]
        environment.estimated_end_time = serialized_data["estimatedEndTime"]
        environment.statistic = serialized_data["statistic"]
        environment.order = serialized_data["order"]

        return environment


# MARK: Updates
class UpdateType(Enum):
    CREATE_VEHICLE = "createVehicle"
    UPDATE_VEHICLE_STATUS = "updateVehicleStatus"
    UPDATE_VEHICLE_STOPS = "updateVehicleStops"
    UPDATE_STATISTIC = "updateStatistic"


class StatisticUpdate(Serializable):
    statistic: dict[str, dict[str, dict[str, int]]]

    def __init__(self, statistic: dict) -> None:
        self.statistic = statistic

    def serialize(self) -> dict[str, dict[str, dict[str, int]]]:
        return {"statistic": self.statistic}

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "StatisticUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "statistic" not in serialized_data:
            raise ValueError("Invalid data for StatisticUpdate")

        return StatisticUpdate(serialized_data.statistic)


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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VehicleStatusUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "id" not in serialized_data or "status" not in serialized_data:
            raise ValueError("Invalid data for VehicleStatusUpdate")

        vehicle_id = str(serialized_data["id"])
        status = convert_string_to_vehicle_status(serialized_data["status"])
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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VehicleStopsUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "id" not in serialized_data or "previousStops" not in serialized_data or "nextStops" not in serialized_data:
            raise ValueError("Invalid data for VehicleStopsUpdate")

        vehicle_id = str(serialized_data["id"])
        previous_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["previousStops"]]
        next_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["nextStops"]]

        current_stop = serialized_data.get("currentStop", None)
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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "Update":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if (
            "type" not in serialized_data
            or "data" not in serialized_data
            or "timestamp" not in serialized_data
            or "order" not in serialized_data
        ):
            raise ValueError("Invalid data for Update")

        update_type = UpdateType(serialized_data["type"])
        update_data = serialized_data["data"]
        timestamp = float(serialized_data["timestamp"])

        if update_type == UpdateType.CREATE_VEHICLE:
            update_data = VisualizedVehicle.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STATUS:
            update_data = VehicleStatusUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_VEHICLE_STOPS:
            update_data = VehicleStopsUpdate.deserialize(update_data)
        elif update_type == UpdateType.UPDATE_STATISTIC:
            update_data = StatisticUpdate.deserialize(update_data)

        update = Update(update_type, update_data, timestamp)
        update.order = serialized_data["order"]
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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedState":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "updates" not in serialized_data:
            raise ValueError("Invalid data for VisualizedState")

        environment = VisualizedEnvironment.deserialize(serialized_data)

        state = VisualizedState()
        state.passengers = environment.passengers
        state.vehicles = environment.vehicles
        state.timestamp = environment.timestamp
        state.estimated_end_time = environment.estimated_end_time
        state.order = environment.order

        for update_data in serialized_data["updates"]:
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

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "SimulationInformation":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        if "version" not in serialized_data or "simulationId" not in serialized_data:
            raise ValueError("Invalid data for SimulationInformation")

        version = int(serialized_data["version"])
        simulation_id = str(serialized_data["simulationId"])
        simulation_data = str(serialized_data["data"])

        simulation_start_time = serialized_data.get("simulationStartTime", None)
        simulation_end_time = serialized_data.get("simulationEndTime", None)
        last_update_order = serialized_data.get("lastUpdateOrder", None)

        return SimulationInformation(
            simulation_id,
            simulation_data,
            simulation_start_time,
            simulation_end_time,
            last_update_order,
            version,
        )
