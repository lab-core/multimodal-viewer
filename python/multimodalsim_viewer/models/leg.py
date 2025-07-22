from enum import Enum

from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.request import Leg, Trip
from multimodalsim.simulator.stop import Stop

from multimodalsim_viewer.models.serializable import Serializable


# MARK: get_stop_id
def get_stop_id(stop: Stop) -> str:
    return f"{stop.location.lat},{stop.location.lon}"


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
        boarding_stop_id: str | None,
        alighting_stop_id: str | None,
        boarding_stop_index: int | None,
        alighting_stop_index: int | None,
        boarding_time: float | None,
        alighting_time: float | None,
        tags: list[str],
        leg_type: LegType,
    ) -> None:
        self.assigned_vehicle_id: str | None = assigned_vehicle_id

        self.boarding_stop_id: str | None = boarding_stop_id
        self.alighting_stop_id: str | None = alighting_stop_id
        self.boarding_stop_index: int | None = boarding_stop_index
        self.alighting_stop_index: int | None = alighting_stop_index
        self.boarding_time: float | None = boarding_time
        self.alighting_time: float | None = alighting_time

        self.tags: list[str] = tags
        self.leg_type: LegType = leg_type

    @classmethod
    def from_leg_environment_and_trip(  # pylint: disable=too-many-locals, too-many-branches, too-many-arguments, too-many-positional-arguments
        cls,
        leg: Leg,
        environment: Environment,
        trip: Trip,
        leg_type: LegType,
    ) -> "VisualizedLeg":
        boarding_stop_id = None
        alighting_stop_id = None
        boarding_stop_index = None
        alighting_stop_index = None

        route = (
            environment.get_route_by_vehicle_id(leg.assigned_vehicle.id) if leg.assigned_vehicle is not None else None
        )

        all_legs = trip.previous_legs + ([trip.current_leg] if trip.current_leg else []) + trip.next_legs

        same_vehicle_leg_index = 0
        for other_leg in all_legs:
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
                        boarding_stop_id = get_stop_id(stop)
                        boarding_stop_index = i
                        break
                    trip_found_count += 1

            trip_found_count = 0

            for i, stop in enumerate(all_stops):
                if alighting_stop_index is None and trip in (
                    stop.passengers_to_alight + stop.alighting_passengers + stop.alighted_passengers
                ):
                    if trip_found_count == same_vehicle_leg_index:
                        alighting_stop_id = get_stop_id(stop)
                        alighting_stop_index = i
                        break
                    trip_found_count += 1

        assigned_vehicle_id = leg.assigned_vehicle.id if leg.assigned_vehicle is not None else None

        return cls(
            assigned_vehicle_id,
            boarding_stop_id,
            alighting_stop_id,
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

        if self.boarding_stop_id is not None:
            serialized["boardingStopId"] = self.boarding_stop_id

        if self.alighting_stop_id is not None:
            serialized["alightingStopId"] = self.alighting_stop_id

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

        boarding_stop_id = serialized_data.get("boardingStopId", None)

        alighting_stop_id = serialized_data.get("alightingStopId", None)

        boarding_stop_index = serialized_data.get("boardingStopIndex", None)
        if boarding_stop_index is not None:
            boarding_stop_index = int(boarding_stop_index)

        alighting_stop_index = serialized_data.get("alightingStopIndex", None)
        if alighting_stop_index is not None:
            alighting_stop_index = int(alighting_stop_index)

        boarding_time = serialized_data.get("boardingTime", None)
        if boarding_time is not None:
            boarding_time = float(boarding_time)

        alighting_time = serialized_data.get("alightingTime", None)
        if alighting_time is not None:
            alighting_time = float(alighting_time)

        tags = serialized_data.get("tags", [])

        leg_type = serialized_data.get("legType")

        return cls(
            assigned_vehicle_id,
            boarding_stop_id,
            alighting_stop_id,
            boarding_stop_index,
            alighting_stop_index,
            boarding_time,
            alighting_time,
            tags,
            LegType(leg_type),
        )
