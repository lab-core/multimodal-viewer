from enum import Enum

from multimodalsim_viewer.common.utils import Serializable
from multimodalsim_viewer.server.model import (
    LegType,
    VisualizedEnvironment,
    VisualizedLeg,
    VisualizedPassenger,
    convert_passenger_status_to_string,
    convert_string_to_passenger_status,
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
        self.__update_type = update_type
        self.__update_index = update_index
        self.__event_index = event_index
        self.__event_name = event_name
        self.__timestamp = timestamp

    @property
    def update_type(self) -> UpdateType:
        return self.__update_type

    @property
    def update_index(self) -> int:
        return self.__update_index

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
        self, old_passenger: VisualizedPassenger | None, new_passenger: VisualizedPassenger
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

    def __update_legs(self, passenger: VisualizedPassenger) -> None:
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
