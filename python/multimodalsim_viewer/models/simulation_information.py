from multimodalsim_viewer.common.utils import (
    SAVE_VERSION,
    SIMULATION_SAVE_FILE_SEPARATOR,
)
from multimodalsim_viewer.models.serializable import Serializable


# MARK: SimulationInformation
class SimulationInformation(Serializable):  # pylint: disable=too-many-instance-attributes

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        simulation_id: str,
        data: str,
        simulation_start_time: float | None,
        simulation_end_time: float | None,
        last_update_index: int | None,
        version: int | None,
    ) -> None:
        self.version: int = version
        if self.version is None:
            self.version = SAVE_VERSION

        self.simulation_id: str = simulation_id

        self.name: str = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)[1]
        self.start_time: str = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)[0]
        self.data: str = data

        self.simulation_start_time: float | None = simulation_start_time
        self.simulation_end_time: float | None = simulation_end_time
        self.last_update_index: int | None = last_update_index

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

        if self.last_update_index is not None:
            serialized["lastUpdateIndex"] = self.last_update_index

        return serialized

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "SimulationInformation":
        serialized_data = cls.serialized_data_to_dict(serialized_data)

        required_keys = ["version", "simulationId", "data"]
        cls.verify_required_fields(serialized_data, required_keys, "SimulationInformation")

        version = int(serialized_data["version"])
        simulation_id = str(serialized_data["simulationId"])
        simulation_data = str(serialized_data["data"])

        simulation_start_time = serialized_data.get("simulationStartTime", None)
        if simulation_start_time is not None:
            simulation_start_time = float(simulation_start_time)

        simulation_end_time = serialized_data.get("simulationEndTime", None)
        if simulation_end_time is not None:
            simulation_end_time = float(simulation_end_time)

        last_update_index = serialized_data.get("lastUpdateIndex", None)
        if last_update_index is not None:
            last_update_index = int(last_update_index)

        return SimulationInformation(
            simulation_id,
            simulation_data,
            simulation_start_time,
            simulation_end_time,
            last_update_index,
            version,
        )
