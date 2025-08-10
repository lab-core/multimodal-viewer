from multimodalsim_viewer.models.environment import VisualizedEnvironment
from multimodalsim_viewer.models.update import Update


# MARK: State
class VisualizedState(VisualizedEnvironment):
    def __init__(self) -> None:
        super().__init__()
        self.updates: list[Update] = []

    @classmethod
    def from_environment(cls, environment: VisualizedEnvironment) -> "VisualizedState":
        state = cls()
        state.passengers = environment.passengers
        state.vehicles = environment.vehicles
        state.timestamp = environment.timestamp
        state.estimated_end_time = environment.estimated_end_time
        state.update_index = environment.update_index
        return state

    def serialize(self) -> dict:
        serialized = super().serialize()

        serialized["updates"] = [update.serialize() for update in self.updates]

        return serialized

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "VisualizedState":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        environment = VisualizedEnvironment.deserialize(serialized_data)

        required_keys = ["updates"]

        cls.verify_required_fields(serialized_data, required_keys, "VisualizedState")

        state = cls.from_environment(environment)

        for update_data in serialized_data["updates"]:
            update = Update.deserialize(update_data)
            state.updates.append(update)

        return state
