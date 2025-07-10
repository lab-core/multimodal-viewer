import json
import os

from filelock import FileLock

from multimodalsim_viewer.common.utils import (
    SIMULATION_SAVE_FILE_SEPARATOR,
    get_data_directory_path,
)
from multimodalsim_viewer.server.model import (
    SimulationInformation,
    Update,
    VisualizedEnvironment,
)


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

    __STATES_ORDER_MINIMUM_LENGTH = 8
    __STATES_TIMESTAMP_MINIMUM_LENGTH = 8

    # Only send a maximum of __MAX_STATES_AT_ONCE states at once
    # This should be at least 2
    __MAX_STATES_AT_ONCE = 2

    # The client keeps a maximum of __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY + __MAX_STATES_IN_CLIENT_AFTER_NECESSARY + 1
    # states in memory
    # The current one, the previous __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY and
    # the next __MAX_STATES_IN_CLIENT_AFTER_NECESSARY
    # __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY = 24
    # __MAX_STATES_IN_CLIENT_AFTER_NECESSARY = 50

    # MARK: +- Format
    @staticmethod
    def __format_json_readable(data: dict, file: str) -> str:
        return json.dump(data, file, indent=2, separators=(",", ": "), sort_keys=True)

    @staticmethod
    def __format_json_one_line(data: dict, file: str) -> str:
        # Add new line before if not empty
        if file.tell() != 0:
            file.write("\n")
        return json.dump(data, file, separators=(",", ":"))

    # MARK: +- File paths
    @staticmethod
    def get_saved_simulations_directory_path() -> str:
        directory_path = os.path.join(
            get_data_directory_path(), SimulationVisualizationDataManager.__SAVED_SIMULATIONS_DIRECTORY_NAME
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
    def get_saved_simulation_state_file_path(simulation_id: str, order: int, timestamp: float) -> str:
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_states_folder_path(simulation_id)

        padded_order = str(order).zfill(SimulationVisualizationDataManager.__STATES_ORDER_MINIMUM_LENGTH)
        padded_timestamp = str(int(timestamp)).zfill(
            SimulationVisualizationDataManager.__STATES_TIMESTAMP_MINIMUM_LENGTH
        )

        # States and updates are stored in a .jsonl file to speed up reads and writes
        # Each line is a state (the first line) or an update (the following lines)
        file_path = f"{folder_path}/{padded_order}-{padded_timestamp}.jsonl"

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
            order, timestamp = state_file.split("-")
            states.append((int(order), float(timestamp.split(".")[0])))

        return sorted(states, key=lambda x: (x[1], x[0]))

    @staticmethod
    def save_state(simulation_id: str, environment: VisualizedEnvironment) -> str:
        file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
            simulation_id, environment.order, environment.timestamp
        )

        lock = FileLock(f"{file_path}.lock")

        with lock:
            with open(file_path, "w", encoding="utf-8") as file:
                SimulationVisualizationDataManager.__format_json_one_line(environment.serialize(), file)

        return file_path

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
        loaded_state_orders: list[int],
        is_simulation_complete: bool,
    ) -> tuple[list[str], dict[list[str]], list[int], bool, int, int, int]:
        sorted_states = SimulationVisualizationDataManager.get_sorted_states(simulation_id)

        if len(sorted_states) == 0:
            return ([], {}, [], False, 0, 0, 0)

        necessary_state_index = None

        for index, (order, state_timestamp) in enumerate(sorted_states):
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

        state_orders_to_keep = []
        missing_states = []
        missing_updates = {}

        last_state_index_in_client = -1
        all_state_indexes_in_client = []

        # We want to load the necessary state first, followed by
        # the __MAX_STATES_IN_CLIENT_AFTER_NECESSARY next states and
        # then the __MAX_STATES_IN_CLIENT_BEFORE_NECESSARY previous states
        indexes_to_load = (
            [necessary_state_index]
            # + [
            #     next_state_index
            #     for next_state_index in range(
            #         necessary_state_index + 1,
            #         min(
            #             necessary_state_index
            #             + SimulationVisualizationDataManager.__MAX_STATES_IN_CLIENT_AFTER_NECESSARY
            #             + 1,
            #             len(sorted_states),
            #         ),
            #     )
            # ]
            # + [
            #     previous_state_index
            #     for previous_state_index in range(
            #         necessary_state_index - 1,
            #         max(
            #             necessary_state_index
            #             - SimulationVisualizationDataManager.__MAX_STATES_IN_CLIENT_BEFORE_NECESSARY
            #             - 1,
            #             -1,
            #         ),
            #         -1,
            #     )
            # ]
            # All next states
            + list(range(necessary_state_index + 1, len(sorted_states)))
            # All previous states
            + list(range(necessary_state_index - 1, -1, -1))
        )

        for index in indexes_to_load:
            order, state_timestamp = sorted_states[index]

            # If the client already has the state, skip it
            # except the last state that might have changed
            if order in loaded_state_orders and not order == max(loaded_state_orders):
                state_orders_to_keep.append(order)

                all_state_indexes_in_client.append(index)

                last_state_index_in_client = max(last_state_index_in_client, index)

                continue

            # Don't add states if the max number of states is reached
            # but continue the loop to know which states need to be kept
            if len(missing_states) >= SimulationVisualizationDataManager.__MAX_STATES_AT_ONCE:
                continue

            state_file_path = SimulationVisualizationDataManager.get_saved_simulation_state_file_path(
                simulation_id, order, state_timestamp
            )

            lock = FileLock(f"{state_file_path}.lock")

            with lock:
                with open(state_file_path, "r", encoding="utf-8") as file:
                    environment_data = file.readline()
                    missing_states.append(environment_data)

                    updates_data = file.readlines()
                    current_state_updates = []
                    for update_data in updates_data:
                        current_state_updates.append(update_data)

                    missing_updates[order] = current_state_updates

                    all_state_indexes_in_client.append(index)

                    last_state_index_in_client = max(last_state_index_in_client, index)

        client_has_last_state = last_state_index_in_client == len(sorted_states) - 1
        client_has_max_states = len(missing_states) + len(state_orders_to_keep) >= len(indexes_to_load)

        should_request_more_states = (is_simulation_complete and not client_has_max_states) or (
            not is_simulation_complete and (client_has_last_state or not client_has_max_states)
        )

        first_continuous_state_index = necessary_state_index
        last_continuous_state_index = necessary_state_index

        all_state_indexes_in_client.sort()

        necessary_state_index_index = all_state_indexes_in_client.index(necessary_state_index)

        for index in range(necessary_state_index_index - 1, -1, -1):
            if all_state_indexes_in_client[index] == first_continuous_state_index - 1:
                first_continuous_state_index -= 1
            else:
                break

        for index in range(necessary_state_index_index + 1, len(all_state_indexes_in_client)):
            if all_state_indexes_in_client[index] == last_continuous_state_index + 1:
                last_continuous_state_index += 1
            else:
                break

        first_continuous_state_order = sorted_states[first_continuous_state_index][0]
        last_continuous_state_order = sorted_states[last_continuous_state_index][0]

        necessary_state_order = sorted_states[necessary_state_index][0]

        return (
            missing_states,
            missing_updates,
            state_orders_to_keep,
            should_request_more_states,
            first_continuous_state_order,
            last_continuous_state_order,
            necessary_state_order,
        )

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
