import os
from io import TextIOWrapper
from json import dump, loads

from filelock import FileLock

from multimodalsim_viewer.common.utils import (
    INPUT_DATA_DIRECTORY_PATH,
    NUMBER_OF_STATES_TO_SEND_AT_ONCE,
    SIMULATION_SAVE_FILE_SEPARATOR,
)
from multimodalsim_viewer.models.environment import VisualizedEnvironment
from multimodalsim_viewer.models.simulation_information import SimulationInformation
from multimodalsim_viewer.models.update import Update


# MARK: Data Manager
class SimulationVisualizationDataManager:  # pylint: disable=too-many-public-methods
    """
    This class manage reads and writes of simulation data for visualization.
    """

    __CORRUPTED_FILE_NAME = ".corrupted"
    __SAVED_SIMULATIONS_DIRECTORY_NAME = "saved_simulations"
    __SIMULATION_INFORMATION_FILE_NAME = "simulation_information.json"
    __STATES_DIRECTORY_NAME = "states"
    __POLYLINES_DIRECTORY_NAME = "polylines"
    __POLYLINES_FILE_NAME = "polylines"
    __POLYLINES_VERSION_FILE_NAME = "version"

    __STATES_UPDATE_INDEX_MINIMUM_LENGTH = 8
    __STATES_TIMESTAMP_MINIMUM_LENGTH = 8

    # MARK: +- Format
    @staticmethod
    def __format_json_readable(data: dict, file: str) -> str:
        return dump(data, file, indent=2, separators=(",", ": "), sort_keys=True)

    @staticmethod
    def __format_json_one_line(data: dict | str | int | float | bool, file: str) -> str:
        # Add new line before if not empty
        if file.tell() != 0:
            file.write("\n")
        return dump(data, file, separators=(",", ":"))

    # MARK: +- File paths
    @staticmethod
    def get_saved_simulations_directory_path() -> str:
        directory_path = os.path.join(
            SimulationVisualizationDataManager.get_data_directory_path(),
            SimulationVisualizationDataManager.__SAVED_SIMULATIONS_DIRECTORY_NAME,
        )

        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        return directory_path

    @staticmethod
    def get_all_saved_simulation_ids() -> list[str]:
        directory_path = SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        return os.listdir(directory_path)

    @staticmethod
    def get_saved_simulation_directory_path(simulation_id: str, should_create=False) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulations_directory_path()
        simulation_directory_path = f"{directory_path}/{simulation_id}"

        if should_create and not os.path.exists(simulation_directory_path):
            os.makedirs(simulation_directory_path)

        return simulation_directory_path

    # MARK: +- Folder size
    @staticmethod
    def _get_folder_size(start_path: str) -> int:
        total_size = 0
        for directory_path, _, file_names in os.walk(start_path):
            file_names = [name for name in file_names if not name.endswith(".lock")]
            for file_name in file_names:
                file_path = os.path.join(directory_path, file_name)
                lock = FileLock(f"{file_path}.lock")
                with lock:
                    total_size += os.path.getsize(file_path)
        return total_size

    @staticmethod
    def get_saved_simulation_size(simulation_id: str) -> int:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id
        )
        return SimulationVisualizationDataManager._get_folder_size(simulation_directory_path)

    # MARK: +- Corrupted
    @staticmethod
    def is_simulation_corrupted(simulation_id: str) -> bool:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )

        return os.path.exists(f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}")

    @staticmethod
    def mark_simulation_as_corrupted(simulation_id: str) -> None:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )

        file_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__CORRUPTED_FILE_NAME}"

        with open(file_path, "w", encoding="utf-8") as file:
            file.write("")

    # MARK: +- Simulation Information
    @staticmethod
    def get_saved_simulation_information_file_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        file_path = (
            f"{simulation_directory_path}/{SimulationVisualizationDataManager.__SIMULATION_INFORMATION_FILE_NAME}"
        )

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_simulation_information(simulation_id: str, simulation_information: SimulationInformation) -> None:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(simulation_id)

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_readable(simulation_information.serialize(), file)

    @staticmethod
    def get_simulation_information(simulation_id: str) -> SimulationInformation:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_information_file_path(simulation_id)

        lock = FileLock(f"{file_path}.lock")

        simulation_information = None
        should_update_simulation_information = False

        with lock:
            with open(file_path, "r", encoding="utf-8") as file:
                data = file.read()

                simulation_information = SimulationInformation.deserialize(data)

                # Handle mismatched simulation_id, name, or start_time because of uploads
                # where the simulation folder has been renamed due to duplicates.
                start_time, name = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)

                if (
                    simulation_id != simulation_information.simulation_id
                    or name != simulation_information.name
                    or start_time != simulation_information.start_time
                ):
                    simulation_information.simulation_id = simulation_id
                    simulation_information.name = name
                    simulation_information.start_time = start_time

        if simulation_information is not None and should_update_simulation_information:
            SimulationVisualizationDataManager.set_simulation_information(simulation_id, simulation_information)

        return simulation_information

    # MARK: +- States and updates
    @staticmethod
    def get_saved_simulation_states_folder_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        folder_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__STATES_DIRECTORY_NAME}"

        if not os.path.exists(folder_path):
            os.makedirs(folder_path)

        return folder_path

    @staticmethod
    def get_saved_simulation_state_file_path(simulation_id: str, update_index: int, timestamp: float) -> str:
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(simulation_id)

        padded_update_index = str(update_index).zfill(
            SimulationVisualizationDataManager.__STATES_UPDATE_INDEX_MINIMUM_LENGTH
        )
        padded_timestamp = str(int(timestamp)).zfill(
            SimulationVisualizationDataManager.__STATES_TIMESTAMP_MINIMUM_LENGTH
        )

        # States and updates are stored in a .jsonl file to speed up reads and writes
        # Each line is a state (the first line) or an update (the following lines)
        file_path = f"{folder_path}/{padded_update_index}-{padded_timestamp}.jsonl"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def get_sorted_states(simulation_id: str) -> list[tuple[int, float]]:
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(simulation_id)

        all_states_files = [
            path for path in os.listdir(folder_path) if path.endswith(".jsonl")
        ]  # Filter out lock files

        states = []
        for state_file in all_states_files:
            update_index, timestamp = state_file.split("-")
            states.append((int(update_index), float(timestamp.split(".")[0])))

        return sorted(states, key=lambda x: (x[1], x[0]))

    @staticmethod
    def save_state(simulation_id: str, environment: VisualizedEnvironment) -> str:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
            simulation_id, environment.update_index, environment.timestamp
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w", encoding="utf-8") as file:
                # Store timestamp
                SimulationVisualizationDataManager.__format_json_one_line(environment.timestamp, file)

                # Store update index
                SimulationVisualizationDataManager.__format_json_one_line(environment.update_index, file)

                # Store statistics
                SimulationVisualizationDataManager.__format_json_one_line(
                    environment.statistics if environment.statistics else {}, file
                )

                # Store total number of passengers
                SimulationVisualizationDataManager.__format_json_one_line(len(environment.passengers), file)

                # Store each passenger
                for passenger in environment.passengers.values():
                    SimulationVisualizationDataManager.__format_json_one_line(passenger.serialize(), file)

                # Store total number of vehicles
                SimulationVisualizationDataManager.__format_json_one_line(len(environment.vehicles), file)

                # Store each vehicle
                for vehicle in environment.vehicles.values():
                    SimulationVisualizationDataManager.__format_json_one_line(vehicle.serialize(), file)

        return file_path

    @staticmethod
    def get_state_to_send(file: TextIOWrapper) -> dict:
        state = {}

        state["timestamp"] = loads(file.readline().strip())
        state["updateIndex"] = loads(file.readline().strip())
        state["statistics"] = file.readline().strip()

        state["passengers"] = []

        num_passengers = loads(file.readline().strip())
        for _ in range(num_passengers):
            state["passengers"].append(file.readline().strip())

        state["vehicles"] = []

        num_vehicles = loads(file.readline().strip())
        for _ in range(num_vehicles):
            state["vehicles"].append(file.readline().strip())

        return state

    @staticmethod
    def save_update(file_path: str, update: Update) -> None:
        lock = FileLock(f"{file_path}.lock")
        with lock:
            with open(file_path, "a", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_one_line(update.serialize(), file)

    @staticmethod
    def get_missing_states(  # pylint: disable=too-many-locals, too-many-branches, too-many-statements
        simulation_id: str,
        visualization_time: float,
        complete_state_update_indexes: list[int],
        is_simulation_complete: bool,
    ) -> tuple[list[dict], dict[list[str]], bool]:
        sorted_states = SimulationVisualizationDataManager.get_sorted_states(simulation_id)

        if len(sorted_states) == 0:
            return [], {}, False

        if len(complete_state_update_indexes) == len(sorted_states):
            # If the client has all states, no need to request more
            return [], {}, True

        necessary_state_index = None

        for index, (update_index, state_timestamp) in enumerate(sorted_states):
            if necessary_state_index is None and state_timestamp > visualization_time:
                necessary_state_index = index
                break

        if necessary_state_index is None:
            # If the visualization time is after the last state then
            # The last state is necessary
            necessary_state_index = len(sorted_states) - 1
        else:
            # Else we need the state before the first state with greater timestamp
            necessary_state_index -= 1

        # Handle negative indexes
        necessary_state_index = max(0, necessary_state_index)

        missing_states = []
        missing_updates = {}
        has_incomplete_states = False

        # We want to load the necessary state first, followed by
        # the next states and then the previous states in reverse order.
        indexes_to_load = (
            [necessary_state_index]
            # All next states
            + list(range(necessary_state_index + 1, len(sorted_states)))
            # All previous states
            + list(range(necessary_state_index - 1, -1, -1))
        )

        for index in indexes_to_load:
            update_index, state_timestamp = sorted_states[index]

            # If the client already has the state, skip it.
            if update_index in complete_state_update_indexes:
                continue

            # Don't add states if the max number of states is reached
            # but continue the loop to know which states need to be kept
            if len(missing_states) >= NUMBER_OF_STATES_TO_SEND_AT_ONCE:
                continue

            state_file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                simulation_id, update_index, state_timestamp
            )

            lock = FileLock(f"{state_file_path}.lock")

            with lock:
                with open(state_file_path, "r", encoding="utf-8") as file:
                    state = SimulationVisualizationDataManager.get_state_to_send(file)
                    state["isComplete"] = is_simulation_complete or (index < len(sorted_states) - 1)
                    missing_states.append(state)

                    updates_data = file.readlines()
                    current_state_updates = []
                    for update_data in updates_data:
                        current_state_updates.append(update_data)

                    missing_updates[update_index] = current_state_updates

        has_all_states = (
            len(missing_states) + len(complete_state_update_indexes) == len(sorted_states) and not has_incomplete_states
        )

        return (missing_states, missing_updates, has_all_states)

    # MARK: +- Polylines

    # The polylines are saved with the following structure :
    # polylines/
    #   version
    #   polylines.jsonl
    #     { "coordinatesString": "string", "encodedPolyline": "string", "coefficients": [float] }

    @staticmethod
    def get_saved_simulation_polylines_lock(simulation_id: str) -> FileLock:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        return FileLock(f"{simulation_directory_path}/polylines.lock")

    @staticmethod
    def get_saved_simulation_polylines_directory_path(simulation_id: str) -> str:
        simulation_directory_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(
            simulation_id, True
        )
        directory_path = f"{simulation_directory_path}/{SimulationVisualizationDataManager.__POLYLINES_DIRECTORY_NAME}"

        if not os.path.exists(directory_path):
            os.makedirs(directory_path)

        return directory_path

    @staticmethod
    def get_saved_simulation_polylines_version_file_path(simulation_id: str) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_directory_path(simulation_id)
        file_path = f"{directory_path}/{SimulationVisualizationDataManager.__POLYLINES_VERSION_FILE_NAME}"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write(str(0))

        return file_path

    @staticmethod
    def set_polylines_version(simulation_id: str, version: int) -> None:
        """
        Should always be called in a lock.
        """
        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_version_file_path(simulation_id)

        with open(file_path, "w", encoding="utf-8") as file:
            file.write(str(version))

    @staticmethod
    def get_polylines_version(simulation_id: str) -> int:
        """
        Should always be called in a lock.
        """
        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_version_file_path(simulation_id)

        with open(file_path, "r", encoding="utf-8") as file:
            return int(file.read())

    @staticmethod
    def get_polylines_version_with_lock(simulation_id: str) -> int:
        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)
        with lock:
            return SimulationVisualizationDataManager.get_polylines_version(simulation_id)

    @staticmethod
    def get_saved_simulation_polylines_file_path(simulation_id: str) -> str:
        directory_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_directory_path(simulation_id)

        file_path = f"{directory_path}/{SimulationVisualizationDataManager.__POLYLINES_FILE_NAME}.jsonl"

        if not os.path.exists(file_path):
            with open(file_path, "w", encoding="utf-8") as file:
                file.write("")

        return file_path

    @staticmethod
    def set_polylines(simulation_id: str, polylines: dict[str, tuple[str, list[float]]]) -> None:

        file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(simulation_id)

        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)

        with lock:
            # Increment the version to notify the client that the polylines have changed
            version = SimulationVisualizationDataManager.get_polylines_version(simulation_id)
            version += 1
            SimulationVisualizationDataManager.set_polylines_version(simulation_id, version)

            with open(file_path, "a", encoding="utf-8") as file:
                for coordinates_string, (
                    encoded_polyline,
                    coefficients,
                ) in polylines.items():
                    data = {
                        "coordinatesString": coordinates_string,
                        "encodedPolyline": encoded_polyline,
                        "coefficients": coefficients,
                    }
                    SimulationVisualizationDataManager.__format_json_one_line(data, file)

    @staticmethod
    def get_polylines(
        simulation_id: str,
    ) -> tuple[list[str], int]:

        polylines = []

        lock = SimulationVisualizationDataManager.get_saved_simulation_polylines_lock(simulation_id)

        version = 0

        with lock:
            version = SimulationVisualizationDataManager.get_polylines_version(simulation_id)

            file_path = SimulationVisualizationDataManager.get_saved_simulation_polylines_file_path(simulation_id)

            with open(file_path, "r", encoding="utf-8") as file:
                for line in file:
                    polylines.append(line)

        return polylines, version

    @staticmethod
    def get_all_simulation_states(simulation_id: str) -> tuple[list[str], dict[list[str]]]:
        states = []
        updates = {}

        sorted_states = SimulationVisualizationDataManager.get_sorted_states(simulation_id)

        for update_index, timestamp in sorted_states:
            file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                simulation_id, update_index, timestamp
            )

            lock = FileLock(f"{file_path}.lock")

            with lock:
                with open(file_path, "r", encoding="utf-8") as file:
                    state_data = file.readline()
                    states.append(state_data)

                    updates_data = file.readlines()
                    current_state_updates = []
                    for update_data in updates_data:
                        current_state_updates.append(update_data)

                    updates[update_index] = current_state_updates

        return states, updates

    # MARK: +- Simulation Data
    @staticmethod
    def get_data_directory_path() -> str:
        current_file_path = os.path.abspath(__file__)
        current_file_dir = os.path.dirname(current_file_path)
        data_directory_path = os.path.join(current_file_dir, "..", "data")

        if not os.path.exists(data_directory_path):
            os.makedirs(data_directory_path)

        return data_directory_path

    @staticmethod
    def get_saved_logs_directory_path() -> str:
        data_directory_path = SimulationVisualizationDataManager.get_data_directory_path()
        saved_logs_directory_path = os.path.join(data_directory_path, "saved_logs")

        if not os.path.exists(saved_logs_directory_path):
            os.makedirs(saved_logs_directory_path)

        return saved_logs_directory_path

    @staticmethod
    def get_input_data_directory_path(data: str | None = None) -> str:
        input_data_directory = INPUT_DATA_DIRECTORY_PATH

        if data is not None:
            input_data_directory = os.path.join(input_data_directory, data)

        return input_data_directory

    @staticmethod
    def get_available_data():
        input_data_directory = SimulationVisualizationDataManager.get_input_data_directory_path()

        if not os.path.exists(input_data_directory):
            return []

        # List all directories in the input data directory
        return [
            name
            for name in os.listdir(input_data_directory)
            if os.path.isdir(os.path.join(input_data_directory, name)) and not name.startswith(".")
        ]
