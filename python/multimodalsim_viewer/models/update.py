from enum import Enum

from multimodalsim_viewer.models.environment import VisualizedEnvironment
from multimodalsim_viewer.models.leg import LegType, VisualizedLeg
from multimodalsim_viewer.models.passenger import (
    VisualizedPassenger,
    convert_passenger_status_to_string,
    convert_string_to_passenger_status,
)
from multimodalsim_viewer.models.serializable import Serializable
from multimodalsim_viewer.models.stop import StopType, VisualizedStop
from multimodalsim_viewer.models.vehicle import (
    VisualizedVehicle,
    convert_string_to_vehicle_status,
    convert_vehicle_status_to_string,
)


# MARK: UpdateType
class UpdateType(Enum):
    PASSENGER = "passenger"
    VEHICLE = "vehicle"
    STATISTICS = "statistics"


# MARK: Update
class Update(Serializable):
    """
    Base class for updates in the simulation viewer.

    Represents differences in the simulation environment caused by an event.

    Updates can be applied sequentially to the environment to recreate the evolution of the simulation.
    """

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self, update_type: UpdateType, update_index: int, event_index: int, event_name: str, timestamp: float
    ):
        self.__update_type: UpdateType = update_type
        self.__update_index: int = update_index
        self.__event_index: int = event_index
        self.__event_name: str = event_name
        self.__timestamp: float = timestamp

    @property
    def update_type(self) -> UpdateType:
        return self.__update_type

    @property
    def update_index(self) -> int:
        return self.__update_index

    @update_index.setter
    def update_index(self, value: int) -> None:
        self.__update_index = value

    @property
    def event_index(self) -> int:
        return self.__event_index

    @property
    def event_name(self) -> str:
        return self.__event_name

    @property
    def timestamp(self) -> float:
        return self.__timestamp

    def apply(self, environment: VisualizedEnvironment) -> None:
        """
        Apply the update to the given environment.

        This method should be overridden by subclasses.
        """

    def serialize(self) -> dict:
        return {
            "updateType": self.update_type.value,
            "updateIndex": self.update_index,
            "eventIndex": self.event_index,
            "eventName": self.event_name,
            "timestamp": self.timestamp,
        }

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "Update":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_fields = [
            "updateType",
            "updateIndex",
            "eventIndex",
            "eventName",
            "timestamp",
        ]
        cls.verify_required_fields(serialized_data, required_fields, "Update")

        update_type = UpdateType(serialized_data.get("updateType"))
        update_index = serialized_data.get("updateIndex")
        event_index = serialized_data.get("eventIndex")
        event_name = serialized_data.get("eventName")
        timestamp = serialized_data.get("timestamp")

        return cls(update_type, update_index, event_index, event_name, timestamp)


# MARK: PassengerUpdate
class PassengerUpdate(Update):
    """
    Differences in a passenger before and after an event.
    """

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        update_index: int,
        event_index: int,
        event_name: str,
        timestamp: float,
        old_passenger: VisualizedPassenger | None = None,
        new_passenger: VisualizedPassenger | None = None,
        should_compute_difference: bool = True,
    ):
        super().__init__(UpdateType.PASSENGER, update_index, event_index, event_name, timestamp)

        self.__passenger_id: str | None = None

        # Dictionary containing the new values of the fields that have changed
        self.__differences: dict = {}

        # Legs are more complex and will be handled separately
        self.__number_of_legs_to_remove: int = 0
        self.__legs_to_add: list[VisualizedLeg] = []

        self.__legs_differences: list[dict] = []

        if should_compute_difference:
            self.__compute_difference(old_passenger, new_passenger)

    def __compute_difference(
        self, old_passenger: VisualizedPassenger | None, new_passenger: VisualizedPassenger | None
    ) -> dict:
        """
        Compute the difference between the old and new passenger.
        """

        if new_passenger is None:
            raise ValueError("New passenger cannot be None")

        if old_passenger is not None and old_passenger.passenger_id != new_passenger.passenger_id:
            raise ValueError("Old and new passenger must have the same ID")

        self.__passenger_id = new_passenger.passenger_id

        if old_passenger is None or old_passenger.name != new_passenger.name:
            self.__differences["name"] = new_passenger.name

        if old_passenger is None or old_passenger.status != new_passenger.status:
            self.__differences["status"] = convert_passenger_status_to_string(new_passenger.status)

        if old_passenger is None or old_passenger.number_of_passengers != new_passenger.number_of_passengers:
            self.__differences["numberOfPassengers"] = new_passenger.number_of_passengers

        if old_passenger is None or old_passenger.tags != new_passenger.tags:
            self.__differences["tags"] = new_passenger.tags

        all_old_legs = old_passenger.all_legs if old_passenger is not None else []
        all_new_legs = new_passenger.all_legs

        self.__number_of_legs_to_remove = max(0, len(all_old_legs) - len(all_new_legs))
        self.__legs_to_add = all_new_legs[len(all_old_legs) :]

        for index in range(min(len(all_old_legs), len(all_new_legs))):
            old_leg = all_old_legs[index]
            new_leg = all_new_legs[index]

            leg_difference = self.__compute_leg_difference(old_leg, new_leg, index)
            if leg_difference is not None:
                self.__legs_differences.append(leg_difference)

    def __compute_leg_difference(self, old_leg: VisualizedLeg, new_leg: VisualizedLeg, index: int) -> dict | None:
        """
        Compute the difference between the old and new leg.
        """
        leg_difference = {}

        if old_leg.assigned_vehicle_id != new_leg.assigned_vehicle_id:
            leg_difference["assignedVehicleId"] = new_leg.assigned_vehicle_id

        if old_leg.boarding_stop_id != new_leg.boarding_stop_id:
            leg_difference["boardingStopId"] = new_leg.boarding_stop_id

        if old_leg.alighting_stop_id != new_leg.alighting_stop_id:
            leg_difference["alightingStopId"] = new_leg.alighting_stop_id

        if old_leg.boarding_stop_index != new_leg.boarding_stop_index:
            leg_difference["boardingStopIndex"] = new_leg.boarding_stop_index

        if old_leg.alighting_stop_index != new_leg.alighting_stop_index:
            leg_difference["alightingStopIndex"] = new_leg.alighting_stop_index

        if old_leg.boarding_time != new_leg.boarding_time:
            leg_difference["boardingTime"] = new_leg.boarding_time

        if old_leg.alighting_time != new_leg.alighting_time:
            leg_difference["alightingTime"] = new_leg.alighting_time

        if old_leg.tags != new_leg.tags:
            leg_difference["tags"] = new_leg.tags

        if old_leg.leg_type != new_leg.leg_type:
            leg_difference["legType"] = new_leg.leg_type.value

        if not leg_difference:
            return None

        leg_difference["index"] = index

        return leg_difference

    def apply(self, environment: VisualizedEnvironment) -> None:
        passenger = environment.get_passenger(self.__passenger_id)

        if passenger is None:
            passenger = VisualizedPassenger(
                self.__passenger_id,
                self.__differences.get("name"),
                convert_string_to_passenger_status(self.__differences.get("status")),
                self.__differences.get("numberOfPassengers"),
                [],
                None,
                [],
                self.__differences.get("tags"),
            )

            environment.add_passenger(passenger)

        else:
            if "name" in self.__differences:
                passenger.name = self.__differences.get("name")
            if "status" in self.__differences:
                passenger.status = convert_string_to_passenger_status(self.__differences.get("status"))
            if "numberOfPassengers" in self.__differences:
                passenger.number_of_passengers = self.__differences.get("numberOfPassengers")
            if "tags" in self.__differences:
                passenger.tags = self.__differences.get("tags")

        self.__update_legs(passenger)

    def __update_legs(self, passenger: VisualizedPassenger) -> None:  # pylint: disable=too-many-branches
        all_legs = passenger.all_legs

        if self.__number_of_legs_to_remove > 0:
            all_legs = all_legs[: -self.__number_of_legs_to_remove]

        all_legs.extend(self.__legs_to_add)

        for leg_difference in self.__legs_differences:
            leg = all_legs[leg_difference.get("index")]

            if "legType" in leg_difference:
                leg.leg_type = LegType(leg_difference.get("legType"))
            if "assignedVehicleId" in leg_difference:
                leg.assigned_vehicle_id = leg_difference.get("assignedVehicleId")
            if "boardingStopId" in leg_difference:
                leg.boarding_stop_id = leg_difference.get("boardingStopId")
            if "alightingStopId" in leg_difference:
                leg.alighting_stop_id = leg_difference.get("alightingStopId")
            if "boardingStopIndex" in leg_difference:
                leg.boarding_stop_index = leg_difference.get("boardingStopIndex")
            if "alightingStopIndex" in leg_difference:
                leg.alighting_stop_index = leg_difference.get("alightingStopIndex")
            if "boardingTime" in leg_difference:
                leg.boarding_time = leg_difference.get("boardingTime")
            if "alightingTime" in leg_difference:
                leg.alighting_time = leg_difference.get("alightingTime")

        passenger.previous_legs = []
        passenger.current_leg = None
        passenger.next_legs = []

        for leg in all_legs:
            if leg.leg_type == LegType.PREVIOUS:
                passenger.previous_legs.append(leg)
            elif leg.leg_type == LegType.CURRENT:
                passenger.current_leg = leg
            elif leg.leg_type == LegType.NEXT:
                passenger.next_legs.append(leg)

    def serialize(self) -> dict:
        serialized_data = super().serialize()

        serialized_data["passengerId"] = self.__passenger_id

        if self.__differences:
            serialized_data["differences"] = self.__differences
        if self.__number_of_legs_to_remove > 0:
            serialized_data["numberOfLegsToRemove"] = self.__number_of_legs_to_remove
        if self.__legs_to_add:
            serialized_data["legsToAdd"] = [leg.serialize() for leg in self.__legs_to_add]
        if self.__legs_differences:
            serialized_data["legsDifferences"] = self.__legs_differences

        return serialized_data

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "PassengerUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        update = Update.deserialize(serialized_data)

        passenger_update = cls(
            update.update_index,
            update.event_index,
            update.event_name,
            update.timestamp,
            should_compute_difference=False,
        )

        required_fields = [
            "passengerId",
        ]
        cls.verify_required_fields(serialized_data, required_fields, "PassengerUpdate")

        # pylint: disable=unused-private-member
        passenger_update.__passenger_id = serialized_data.get("passengerId")
        passenger_update.__differences = serialized_data.get("differences", {})
        passenger_update.__number_of_legs_to_remove = serialized_data.get("numberOfLegsToRemove", 0)
        passenger_update.__legs_to_add = [
            VisualizedLeg.deserialize(leg_data) for leg_data in serialized_data.get("legsToAdd", [])
        ]
        passenger_update.__legs_differences = serialized_data.get("legsDifferences", [])
        # pylint: enable=unused-private-member

        return passenger_update


# MARK: VehicleUpdate
class VehicleUpdate(Update):
    """
    Differences in a vehicle before and after an event.
    """

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        update_index: int,
        event_index: int,
        event_name: str,
        timestamp: float,
        old_vehicle: VisualizedVehicle | None = None,
        new_vehicle: VisualizedVehicle | None = None,
        should_compute_difference: bool = True,
    ):
        super().__init__(UpdateType.VEHICLE, update_index, event_index, event_name, timestamp)

        self.__vehicle_id: str | None = None

        # Dictionary containing the new values of the fields that have changed
        self.__differences: dict = {}

        # Stops are more complex and will be handled separately
        self.__number_of_stops_to_remove: int = 0
        self.__stops_to_add: list[VisualizedStop] = []

        self.__stops_differences: list[dict] = []

        # Polylines are only used on the server side to update the polylines file when the simulation is running.
        # We only need to store the new polylines here, and use it when applying the update.
        # In the future, if we want to apply this update in the server by reading the save file,
        # we will need to change this.
        self.__new_polylines: dict[str, tuple[str, list[float]]] | None = (
            new_vehicle.polylines if new_vehicle is not None else None
        )

        if should_compute_difference:
            self.__compute_difference(old_vehicle, new_vehicle)

    @property
    def vehicle_id(self) -> str | None:
        return self.__vehicle_id

    def __compute_difference(
        self, old_vehicle: VisualizedVehicle | None, new_vehicle: VisualizedVehicle | None
    ) -> dict:
        """
        Compute the difference between the old and new vehicle.
        """

        if new_vehicle is None:
            raise ValueError("New vehicle cannot be None")

        if old_vehicle is not None and old_vehicle.vehicle_id != new_vehicle.vehicle_id:
            raise ValueError("Old and new vehicle must have the same ID")

        self.__vehicle_id = new_vehicle.vehicle_id

        if old_vehicle is None or old_vehicle.mode != new_vehicle.mode:
            self.__differences["mode"] = new_vehicle.mode

        if old_vehicle is None or old_vehicle.status != new_vehicle.status:
            self.__differences["status"] = convert_vehicle_status_to_string(new_vehicle.status)

        if old_vehicle is None or old_vehicle.capacity != new_vehicle.capacity:
            self.__differences["capacity"] = new_vehicle.capacity

        if old_vehicle is None or old_vehicle.name != new_vehicle.name:
            self.__differences["name"] = new_vehicle.name

        if old_vehicle is None or old_vehicle.tags != new_vehicle.tags:
            self.__differences["tags"] = new_vehicle.tags

        all_old_stops = old_vehicle.all_stops if old_vehicle is not None else []
        all_new_stops = new_vehicle.all_stops

        self.__number_of_stops_to_remove = max(0, len(all_old_stops) - len(all_new_stops))
        self.__stops_to_add = all_new_stops[len(all_old_stops) :]

        for index in range(min(len(all_old_stops), len(all_new_stops))):
            old_stop = all_old_stops[index]
            new_stop = all_new_stops[index]

            stop_difference = self.__compute_stop_difference(old_stop, new_stop, index)
            if stop_difference is not None:
                self.__stops_differences.append(stop_difference)

    def __compute_stop_difference(self, old_stop: VisualizedStop, new_stop: VisualizedStop, index: int) -> dict | None:
        """
        Compute the difference between the old and new stop.
        """
        stop_difference = {}

        if old_stop.arrival_time != new_stop.arrival_time:
            stop_difference["arrivalTime"] = new_stop.arrival_time

        if old_stop.departure_time != new_stop.departure_time:
            stop_difference["departureTime"] = new_stop.departure_time

        if old_stop.latitude != new_stop.latitude:
            stop_difference["latitude"] = new_stop.latitude

        if old_stop.longitude != new_stop.longitude:
            stop_difference["longitude"] = new_stop.longitude

        if old_stop.capacity != new_stop.capacity:
            stop_difference["capacity"] = new_stop.capacity

        if old_stop.label != new_stop.label:
            stop_difference["label"] = new_stop.label

        if old_stop.tags != new_stop.tags:
            stop_difference["tags"] = new_stop.tags

        if old_stop.stop_type != new_stop.stop_type:
            stop_difference["stopType"] = new_stop.stop_type.value

        if not stop_difference:
            return None

        stop_difference["index"] = index

        return stop_difference

    def apply(self, environment: VisualizedEnvironment) -> None:
        vehicle = environment.get_vehicle(self.__vehicle_id)

        if vehicle is None:
            vehicle = VisualizedVehicle(
                self.__vehicle_id,
                self.__differences.get("mode"),
                convert_string_to_vehicle_status(self.__differences.get("status")),
                self.__new_polylines,
                [],
                None,
                [],
                self.__differences.get("capacity"),
                self.__differences.get("name"),
                self.__differences.get("tags"),
            )

            environment.add_vehicle(vehicle)

        else:
            vehicle.polylines = self.__new_polylines

            if "mode" in self.__differences:
                vehicle.mode = self.__differences.get("mode")
            if "status" in self.__differences:
                vehicle.status = convert_string_to_vehicle_status(self.__differences.get("status"))
            if "capacity" in self.__differences:
                vehicle.capacity = self.__differences.get("capacity")
            if "name" in self.__differences:
                vehicle.name = self.__differences.get("name")
            if "tags" in self.__differences:
                vehicle.tags = self.__differences.get("tags")

        self.__update_stops(vehicle)

    def __update_stops(self, vehicle: VisualizedVehicle) -> None:  # pylint: disable=too-many-branches
        all_stops = vehicle.all_stops

        if self.__number_of_stops_to_remove > 0:
            all_stops = all_stops[: -self.__number_of_stops_to_remove]

        all_stops.extend(self.__stops_to_add)

        for stop_difference in self.__stops_differences:
            stop = all_stops[stop_difference.get("index")]

            if "arrivalTime" in stop_difference:
                stop.arrival_time = stop_difference.get("arrivalTime")
            if "departureTime" in stop_difference:
                stop.departure_time = stop_difference.get("departureTime")
            if "latitude" in stop_difference:
                stop.latitude = stop_difference.get("latitude")
            if "longitude" in stop_difference:
                stop.longitude = stop_difference.get("longitude")
            if "capacity" in stop_difference:
                stop.capacity = stop_difference.get("capacity")
            if "label" in stop_difference:
                stop.label = stop_difference.get("label")
            if "tags" in stop_difference:
                stop.tags = stop_difference.get("tags")
            if "stopType" in stop_difference:
                stop.stop_type = StopType(stop_difference.get("stopType"))

        vehicle.previous_stops = []
        vehicle.current_stop = None
        vehicle.next_stops = []

        for stop in all_stops:
            if stop.stop_type == StopType.PREVIOUS:
                vehicle.previous_stops.append(stop)
            elif stop.stop_type == StopType.CURRENT:
                vehicle.current_stop = stop
            elif stop.stop_type == StopType.NEXT:
                vehicle.next_stops.append(stop)

    def serialize(self) -> dict:
        serialized_data = super().serialize()

        serialized_data["vehicleId"] = self.__vehicle_id

        if self.__differences:
            serialized_data["differences"] = self.__differences
        if self.__number_of_stops_to_remove > 0:
            serialized_data["numberOfStopsToRemove"] = self.__number_of_stops_to_remove
        if self.__stops_to_add:
            serialized_data["stopsToAdd"] = [stop.serialize() for stop in self.__stops_to_add]
        if self.__stops_differences:
            serialized_data["stopsDifferences"] = self.__stops_differences

        return serialized_data

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VehicleUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        update = Update.deserialize(serialized_data)

        vehicle_update = cls(
            update.update_index,
            update.event_index,
            update.event_name,
            update.timestamp,
            should_compute_difference=False,
        )

        required_fields = [
            "vehicleId",
        ]
        cls.verify_required_fields(serialized_data, required_fields, "VehicleUpdate")

        # pylint: disable=unused-private-member
        vehicle_update.__vehicle_id = serialized_data.get("vehicleId")
        vehicle_update.__differences = serialized_data.get("differences", {})
        vehicle_update.__number_of_stops_to_remove = serialized_data.get("numberOfStopsToRemove", 0)
        vehicle_update.__stops_to_add = [
            VisualizedStop.deserialize(stop_data) for stop_data in serialized_data.get("stopsToAdd", [])
        ]
        vehicle_update.__stops_differences = serialized_data.get("stopsDifferences", [])
        # pylint: enable=unused-private-member

        return vehicle_update


# MARK: StatisticsUpdate
class StatisticsUpdate(Update):
    """
    New statistics computed by the simulation.
    """

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self, update_index: int, event_index: int, event_name: str, timestamp: float, statistics: dict
    ):
        super().__init__(UpdateType.STATISTICS, update_index, event_index, event_name, timestamp)
        self.__statistics: dict = statistics

    def apply(self, environment: VisualizedEnvironment) -> None:
        environment.statistics = self.__statistics

    def serialize(self) -> dict:
        serialized_data = super().serialize()
        serialized_data["statistics"] = self.__statistics
        return serialized_data

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "StatisticsUpdate":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        update = Update.deserialize(serialized_data)

        required_fields = ["statistics"]
        cls.verify_required_fields(serialized_data, required_fields, "StatisticsUpdate")

        return cls(
            update.update_index, update.event_index, update.event_name, update.timestamp, serialized_data["statistics"]
        )
