from multimodalsim_viewer.models.passenger import VisualizedPassenger
from multimodalsim_viewer.models.serializable import Serializable
from multimodalsim_viewer.models.vehicle import VisualizedVehicle


# MARK: Environment
class VisualizedEnvironment(Serializable):

    def __init__(self) -> None:
        self.passengers: dict[str, VisualizedPassenger] = {}
        self.vehicles: dict[str, VisualizedVehicle] = {}
        self.timestamp: float = 0.0
        self.estimated_end_time: float = 0.0
        self.update_index: int = 0
        self.statistics: dict | None = None

    def add_passenger(self, passenger: VisualizedPassenger) -> None:
        self.passengers[passenger.passenger_id] = passenger

    def get_passenger(self, passenger_id: str) -> VisualizedPassenger | None:
        if passenger_id in self.passengers:
            return self.passengers[passenger_id]
        return None

    def add_vehicle(self, vehicle: VisualizedVehicle) -> None:
        self.vehicles[vehicle.vehicle_id] = vehicle

    def get_vehicle(self, vehicle_id: str) -> VisualizedVehicle | None:
        if vehicle_id in self.vehicles:
            return self.vehicles[vehicle_id]
        return None

    def serialize(self) -> dict:
        return {
            "passengers": [passenger.serialize() for passenger in self.passengers.values()],
            "vehicles": [vehicle.serialize() for vehicle in self.vehicles.values()],
            "timestamp": self.timestamp,
            "statistics": self.statistics if self.statistics is not None else {},
            "updateIndex": self.update_index,
        }

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedEnvironment":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_keys = [
            "passengers",
            "vehicles",
            "timestamp",
            "statistics",
            "updateIndex",
        ]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedEnvironment")

        environment = VisualizedEnvironment()
        for passenger_data in serialized_data["passengers"]:
            passenger = VisualizedPassenger.deserialize(passenger_data)
            environment.add_passenger(passenger)

        for vehicle_data in serialized_data["vehicles"]:
            vehicle = VisualizedVehicle.deserialize(vehicle_data)
            environment.add_vehicle(vehicle)

        environment.timestamp = serialized_data["timestamp"]
        environment.estimated_end_time = serialized_data["estimatedEndTime"]
        environment.statistics = serialized_data["statistics"]
        environment.update_index = serialized_data["updateIndex"]

        return environment
