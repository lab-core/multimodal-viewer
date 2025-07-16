from multimodalsim.optimization.dispatcher import (  # To avoid circular import issues. pylint: disable=unused-import;
    Dispatcher,
)
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.request import Trip
from multimodalsim.state_machine.status import PassengerStatus

from multimodalsim_viewer.models.leg import LegType, VisualizedLeg
from multimodalsim_viewer.models.serializable import Serializable


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


# MARK: Passenger
class VisualizedPassenger(Serializable):  # pylint: disable=too-many-instance-attributes

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
        self.passenger_id: str = passenger_id
        self.name: str | None = name
        self.status: PassengerStatus = status
        self.number_of_passengers: int = number_of_passengers

        self.previous_legs: list[VisualizedLeg] = previous_legs
        self.current_leg: VisualizedLeg | None = current_leg
        self.next_legs: list[VisualizedLeg] = next_legs

        self.tags: list[str] = tags

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

    # Similar to VisualizedVehicle
    # pylint: disable=duplicate-code
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

        required_keys = [
            "id",
            "status",
            "previousLegs",
            "nextLegs",
            "numberOfPassengers",
        ]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedPassenger")

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

    # pylint: enable=duplicate-code
