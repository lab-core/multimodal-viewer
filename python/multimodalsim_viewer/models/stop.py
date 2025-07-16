from enum import Enum
from math import inf

from multimodalsim.simulator.stop import Stop

from multimodalsim_viewer.models.serializable import Serializable


# MARK: StopType
class StopType(Enum):
    PREVIOUS = "previous"
    CURRENT = "current"
    NEXT = "next"


# MARK: Stop
class VisualizedStop(Serializable):  # pylint: disable=too-many-instance-attributes

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        arrival_time: float,
        departure_time: float | None,
        latitude: float | None,
        longitude: float | None,
        capacity: int | None,
        label: str,
        tags: list[str],
        stop_type: StopType,
    ) -> None:
        self.arrival_time: float = arrival_time
        self.departure_time: float | None = departure_time
        self.latitude: float | None = latitude
        self.longitude: float | None = longitude
        self.capacity: int | None = capacity
        self.label: str = label
        self.tags: list[str] = tags
        self.stop_type: StopType = stop_type

    @classmethod
    def from_stop(cls, stop: Stop, stop_type: StopType) -> "VisualizedStop":
        return cls(
            stop.arrival_time,
            stop.departure_time if stop.departure_time != inf else None,
            stop.location.lat,
            stop.location.lon,
            stop.capacity,
            stop.location.label,
            stop.tags,
            stop_type,
        )

    def serialize(self) -> dict:
        serialized = {"arrivalTime": self.arrival_time, "stopType": self.stop_type.value}

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

        required_keys = ["arrivalTime", "label", "stopType"]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedStop")

        arrival_time = float(serialized_data["arrivalTime"])
        departure_time = serialized_data.get("departureTime", None)
        if departure_time is not None:
            departure_time = float(departure_time)

        latitude = None
        longitude = None

        position = serialized_data.get("position", None)

        if position is not None:
            latitude = position.get("latitude", None)
            if latitude is not None:
                latitude = float(latitude)

            longitude = position.get("longitude", None)
            if longitude is not None:
                longitude = float(longitude)

        capacity = serialized_data.get("capacity", None)

        if capacity is not None:
            capacity = int(capacity)

        label = serialized_data["label"]

        tags = serialized_data.get("tags", [])

        stop_type = serialized_data.get("stopType")

        return VisualizedStop(
            arrival_time, departure_time, latitude, longitude, capacity, label, tags, StopType(stop_type)
        )
