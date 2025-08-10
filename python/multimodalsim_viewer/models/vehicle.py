from multimodalsim.simulator.vehicle import Route, Vehicle
from multimodalsim.state_machine.status import VehicleStatus

from multimodalsim_viewer.models.serializable import Serializable
from multimodalsim_viewer.models.stop import StopType, VisualizedStop


# MARK: Enums
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


# MARK: Vehicle
class VisualizedVehicle(Serializable):  # pylint: disable=too-many-instance-attributes

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
        name: str,
        tags: list[str],
    ) -> None:
        self.vehicle_id: str = str(vehicle_id)
        self.mode: str | None = mode
        self.status: VehicleStatus = status
        self.polylines: dict[str, tuple[str, list[float]]] | None = polylines

        self.previous_stops: list[VisualizedStop] = previous_stops
        self.current_stop: VisualizedStop | None = current_stop
        self.next_stops: list[VisualizedStop] = next_stops

        self.capacity: int = capacity
        self.name: str = name

        self.tags: list[str] = tags

    @property
    def all_stops(self) -> list[VisualizedStop]:
        return self.previous_stops + ([self.current_stop] if self.current_stop is not None else []) + self.next_stops

    @classmethod
    def from_vehicle_and_route(cls, vehicle: Vehicle, route: Route) -> "VisualizedVehicle":
        previous_stops = [VisualizedStop.from_stop(stop, StopType.PREVIOUS) for stop in route.previous_stops]
        current_stop = (
            VisualizedStop.from_stop(route.current_stop, StopType.CURRENT) if route.current_stop is not None else None
        )
        next_stops = [VisualizedStop.from_stop(stop, StopType.NEXT) for stop in route.next_stops]
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

    # Similar to VisualizedPassenger
    # pylint: disable=duplicate-code
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
            "name",
            "previousStops",
            "nextStops",
            "capacity",
        ]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedVehicle")

        vehicle_id = str(serialized_data["id"])
        mode = serialized_data.get("mode", None)
        status = convert_string_to_vehicle_status(serialized_data["status"])
        previous_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["previousStops"]]
        next_stops = [VisualizedStop.deserialize(stop_data) for stop_data in serialized_data["nextStops"]]
        capacity = int(serialized_data["capacity"])
        name = serialized_data.get("name")

        current_stop = serialized_data.get("currentStop", None)
        if current_stop is not None:
            current_stop = VisualizedStop.deserialize(current_stop)

        tags = serialized_data.get("tags", [])

        return VisualizedVehicle(
            vehicle_id, mode, status, None, previous_stops, current_stop, next_stops, capacity, name, tags
        )

    # pylint: enable=duplicate-code
