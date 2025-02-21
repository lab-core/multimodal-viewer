import datetime
import inspect
import logging
import multiprocessing
import os
import tempfile
import time

from flask_socketio import emit
from server_utils import (
    CLIENT_ROOM,
    SAVE_VERSION,
    STATE_SAVE_STEP,
    SimulationStatus,
    get_session_id,
    log,
)
from simulation import run_simulation
from simulation_visualization_data_model import (
    SimulationVisualizationDataManager,
    Update,
    VisualizedEnvironment,
    extract_byte_offsets,
    get_simulation_save_directory_path,
    read_line_at_byte_offset,
    read_lines_from_byte_offset,
)


class MinimalistSimulationConfiguration:
    max_time: float | None
    time_step: float | None
    speed: float | None
    update_position_time_step: float | None

    def __init__(
        self,
        max_time: float | None,
        time_step: float | None,
        speed: float | None,
        update_position_time_step: float | None,
    ):
        self.max_time = max_time
        self.time_step = time_step
        self.speed = speed
        self.update_position_time_step = update_position_time_step


class SimulationHandler:
    simulation_id: str
    name: str
    start_time: float
    data: str
    process: multiprocessing.Process | None
    status: SimulationStatus
    socket_id: str | None

    simulation_start_time: float | None
    simulation_end_time: float | None

    simulation_time: float | None
    simulation_estimated_end_time: float | None

    def __init__(
        self,
        simulation_id: str,
        name: str,
        start_time: float,
        data: str,
        status: SimulationStatus,
        process: multiprocessing.Process | None = None,
    ) -> None:
        self.simulation_id = simulation_id
        self.name = name
        self.start_time = start_time
        self.data = data
        self.process = process
        self.status = status

        self.socket_id = None

        self.simulation_start_time = None
        self.simulation_end_time = None
        self.simulation_time = None
        self.simulation_estimated_end_time = None


class SimulationManager:
    simulations: dict[str, SimulationHandler]

    def __init__(self):
        self.simulations = {}

    def start_simulation(
        self, name: str, data: str, response_event: str
    ) -> SimulationHandler:
        # Get the current time
        start_time = datetime.datetime.now().strftime("%Y%m%d-%H%M%S%f")
        # Remove microseconds
        start_time = start_time[:-3]

        # Start time first to sort easily
        simulation_id = f"{start_time}-{name}"

        simulation_process = multiprocessing.Process(
            target=run_simulation, args=(simulation_id, data)
        )

        simulation_handler = SimulationHandler(
            simulation_id,
            name,
            start_time,
            data,
            SimulationStatus.STARTING,
            simulation_process,
        )

        self.simulations[simulation_id] = simulation_handler

        simulation_process.start()

        self.emit_simulations()

        log(f'Emitting response event "{response_event}"', "server")
        emit(response_event, simulation_id, to=CLIENT_ROOM)

        return simulation_handler

    def on_simulation_start(self, simulation_id, socket_id, simulation_start_time):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.socket_id = socket_id
        simulation.status = SimulationStatus.RUNNING
        simulation.simulation_start_time = simulation_start_time

        self.emit_simulations()

    def stop_simulation(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]
        simulation.status = SimulationStatus.STOPPING

        emit("stop-simulation", to=simulation.socket_id)

    def on_simulation_end(self, simulation_id: str):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.status = SimulationStatus.COMPLETED

        emit("can-disconnect", to=simulation.socket_id)

        self.emit_simulations()

    def pause_simulation(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        emit("pause-simulation", to=simulation.socket_id)

    def on_simulation_pause(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.status = SimulationStatus.PAUSED

        self.emit_simulations()

    def resume_simulation(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        emit("resume-simulation", to=simulation.socket_id)

    def on_simulation_resume(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.status = SimulationStatus.RUNNING

        self.emit_simulations()

    def on_simulation_disconnect(self, socket_id):
        matching_simulation_ids = [
            simulation_id
            for simulation_id, simulation in self.simulations.items()
            if simulation.socket_id == socket_id
        ]

        if len(matching_simulation_ids) != 1:
            # The simulation has already been disconnected properly
            return

        simulation_id = matching_simulation_ids[0]

        simulation = self.simulations[simulation_id]

        simulation.status = SimulationStatus.LOST

        self.emit_simulations()

    def on_simulation_update_time(self, simulation_id, timestamp):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.simulation_time = timestamp

        self.emit_simulations()

    def on_simulation_update_estimated_end_time(
        self, simulation_id, estimated_end_time
    ):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.simulation_estimated_end_time = estimated_end_time

        self.emit_simulations()

    def on_simulation_identification(
        self,
        simulation_id,
        simulation_time,
        simulation_estimated_end_time,
        status,
        socket_id,
    ):
        # For now, we only identify simulations that are lost
        if (
            simulation_id not in self.simulations
            or self.simulations[simulation_id].status != SimulationStatus.LOST
        ):
            return

        log(
            f"Identifying simulation {simulation_id}",
            "simulation",
        )

        simulation = self.simulations[simulation_id]

        simulation.status = SimulationStatus[status]
        simulation.simulation_time = simulation_time
        simulation.simulation_estimated_end_time = simulation_estimated_end_time
        simulation.socket_id = socket_id

        self.emit_simulations()

    def emit_simulations(self):
        self.query_simulations()

        serialized_simulations = []

        for simulation_id, simulation in self.simulations.items():
            serialized_simulation = {
                "id": simulation_id,
                "name": simulation.name,
                "status": simulation.status.value,
                "startTime": simulation.start_time,
                "data": simulation.data,
            }

            if simulation.simulation_start_time is not None:
                serialized_simulation["simulationStartTime"] = (
                    simulation.simulation_start_time
                )

            if simulation.simulation_end_time is not None:
                serialized_simulation["simulationEndTime"] = (
                    simulation.simulation_end_time
                )

            if simulation.simulation_time is not None:
                serialized_simulation["simulationTime"] = simulation.simulation_time

            if simulation.simulation_estimated_end_time is not None:
                serialized_simulation["simulationEstimatedEndTime"] = (
                    simulation.simulation_estimated_end_time
                )

            serialized_simulations.append(serialized_simulation)

        emit(
            "simulations",
            serialized_simulations,
            to=CLIENT_ROOM,
        )

        log("Emitting simulations", "server")

    def emit_missing_simulation_states(
        self,
        simulation_id: str,
        first_state_order: float,
        last_update_order: float,
        visualization_time: float,
    ):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        try:
            start = time.time()
            byte_offsets = extract_byte_offsets(simulation_id)
            end = time.time()

            log(
                f"Extracted {len(byte_offsets)} byte offsets in {end - start} seconds",
                "server",
            )

            if len(byte_offsets) <= 1:
                return

            # Retrieve line index from state order
            #   states are saved all STATE_SAVE_STEP updates
            #   it means that the difference between the indexes of two states is STATE_SAVE_STEP + 1
            #   and the indexes are 501, 1002, 1503, ...
            #   but orders of states are multiples of STATE_SAVE_STEP - 1 (499, 999, 1499, ...)
            first_sent_line = (
                (first_state_order + 1) // (STATE_SAVE_STEP) * (STATE_SAVE_STEP + 1)
            )

            # Retrieve line index from update order
            #   similar to the previous one but we need to add the offset
            last_sent_line = (last_update_order + 1) // (STATE_SAVE_STEP) * (
                STATE_SAVE_STEP + 1
            ) + (last_update_order + 1) % (STATE_SAVE_STEP)

            # Binary search to find the first update after the current time
            start = time.time()
            first_update_line = 1
            last_update_line = len(byte_offsets) - 1

            while first_update_line < last_update_line:
                middle_update_line = (first_update_line + last_update_line) // 2

                # if the middle update is a state, go to the next one
                if (middle_update_line) % (STATE_SAVE_STEP + 1) == 0:
                    middle_update_line += 1

                update = Update.deserialize(
                    read_line_at_byte_offset(
                        simulation_id, byte_offsets[middle_update_line]
                    )
                )

                previous_first_update_line = first_update_line
                previous_last_update_line = last_update_line

                if update.timestamp <= visualization_time:
                    first_update_line = middle_update_line + 1
                else:
                    last_update_line = middle_update_line

                if (
                    previous_first_update_line == first_update_line
                    and previous_last_update_line == last_update_line
                ):
                    break

            # We mark the first update with a timestamp greater than the visualization time as the center
            # If no update is found, it will be the last update
            corresponding_state_line = (last_update_line // (STATE_SAVE_STEP + 1)) * (
                STATE_SAVE_STEP + 1
            )

            end = time.time()
            log(
                f"Found corresponding state line in {end - start} seconds",
                "server",
            )

            first_line = max(corresponding_state_line - 5 * (STATE_SAVE_STEP + 1), 1)
            last_line = min(
                corresponding_state_line + 5 * (STATE_SAVE_STEP + 1) + STATE_SAVE_STEP,
                len(byte_offsets) - 1,
            )

            number_of_missing_lines_before = first_sent_line - first_line
            number_of_missing_lines_after = last_line - last_sent_line

            start = time.time()
            missing_lines_before = []
            if number_of_missing_lines_before > 0:
                missing_lines_before = read_lines_from_byte_offset(
                    simulation_id,
                    byte_offsets[first_line],
                    number_of_missing_lines_before,
                )
                missing_lines_before = [
                    (first_line + i, line)
                    for i, line in enumerate(missing_lines_before)
                ]

            missing_lines_after = []
            if number_of_missing_lines_after > 0:
                missing_lines_after = read_lines_from_byte_offset(
                    simulation_id,
                    byte_offsets[last_line - number_of_missing_lines_after + 1],
                    number_of_missing_lines_after,
                )
                missing_lines_after = [
                    (last_line - number_of_missing_lines_after + 1 + i, line)
                    for i, line in enumerate(missing_lines_after)
                ]

            missing_states = []
            missing_updates = []
            for i, missing_line in missing_lines_before + missing_lines_after:
                # If the line is a state
                if i % (STATE_SAVE_STEP + 1) == 0:
                    missing_states.append(
                        VisualizedEnvironment.deserialize(missing_line)
                    )
                else:
                    missing_updates.append(Update.deserialize(missing_line))

            if (
                len(missing_lines_before) > 0
                and first_line < STATE_SAVE_STEP + 1
                or last_sent_line == 0
            ):
                # Add empty environment to the beginning if missing
                first_environment = VisualizedEnvironment()
                first_environment.order = -1
                missing_states.append(first_environment)

            # Emit missing lines
            emit(
                "missing-simulation-states",
                (
                    [state.serialize() for state in missing_states],
                    [update.serialize() for update in missing_updates],
                ),
                to=get_session_id(),
            )

            end = time.time()
            log(
                f"Emitted missing states in {end - start} seconds",
                "server",
            )

        except:
            log(
                f"Error while emitting simulation states for {simulation_id}, marking simulation as corrupted",
                "server",
                logging.ERROR,
            )

            simulation.status = SimulationStatus.CORRUPTED

            self.emit_simulations()

    def query_simulations(self):
        all_simulation_ids = (
            SimulationVisualizationDataManager.get_all_saved_simulation_ids()
        )

        for simulation_id in all_simulation_ids:
            # Non valid save files might throw an exception
            self.query_simulation(simulation_id)

    def query_simulation(self, simulation_id) -> None:
        if simulation_id in self.simulations and self.simulations[
            simulation_id
        ].status in [
            SimulationStatus.RUNNING,
            SimulationStatus.PAUSED,
            SimulationStatus.STOPPING,
            SimulationStatus.STARTING,
            SimulationStatus.LOST,
        ]:
            return

        is_corrupted = SimulationVisualizationDataManager.is_simulation_corrupted(
            simulation_id
        )

        if not is_corrupted:
            # Non valid save files throw an exception
            try:
                # Get the simulation information from the save file
                simulation_information = (
                    SimulationVisualizationDataManager.get_simulation_information(
                        simulation_id
                    )
                )

                # Verify the version of the save file
                version = simulation_information.version
                major_version, minor_version = version.split(".")

                save_major_version, save_minor_version = SAVE_VERSION.split(".")

                status = SimulationStatus.OUTDATED
                if major_version == save_major_version:
                    if minor_version <= save_minor_version:
                        status = SimulationStatus.COMPLETED
                    elif minor_version > save_minor_version:
                        status = SimulationStatus.FUTURE
                elif major_version < save_major_version:
                    status = SimulationStatus.OUTDATED
                else:
                    status = SimulationStatus.FUTURE

                if status == SimulationStatus.OUTDATED:
                    log(
                        f"Simulation {simulation_id} version is outdated",
                        "server",
                        logging.DEBUG,
                    )
                if status == SimulationStatus.FUTURE:
                    log(
                        f"Simulation {simulation_id} version is future",
                        "server",
                        logging.DEBUG,
                    )

                simulation = SimulationHandler(
                    simulation_id,
                    simulation_information.name,
                    simulation_information.start_time,
                    simulation_information.data,
                    status,
                )

                simulation_information.simulation_start_time = (
                    simulation_information.simulation_start_time
                )
                simulation.simulation_end_time = (
                    simulation_information.simulation_end_time
                )

                if simulation_information.simulation_end_time is None:
                    # The simulation is not running but the end time is not set
                    raise Exception("Simulation is corrupted")

                self.simulations[simulation_id] = simulation

            except:
                is_corrupted = True

        if is_corrupted:
            log(f"Simulation {simulation_id} is corrupted", "server", logging.DEBUG)

            simulation = SimulationHandler(
                simulation_id,
                "unknown",
                "unknown",
                "unknown",
                SimulationStatus.CORRUPTED,
            )

            self.simulations[simulation_id] = simulation

            SimulationVisualizationDataManager.mark_simulation_as_corrupted(
                simulation_id
            )


if __name__ == "__main__":
    import time

    # Measure the time taken to build the byte_offsets
    simulation_id = "20250216-231211847-small_taxi_test"

    start = time.time()
    byte_offsets = extract_byte_offsets(simulation_id)
    end = time.time()

    print(f"Found {len(byte_offsets)} byte_offsets in {end - start} seconds")

    # Measure the time taken to read all lines separately (~ 10s)
    # start = time.time()
    # for byte_offset in byte_offsets:
    #     read_line_at_byte_offset(simulation_id, byte_offset)
    # end = time.time()

    # print(f"Read all lines in {end - start} seconds")

    # Measure the time taken to read all lines at once
    start = time.time()
    read_lines_from_byte_offset(simulation_id, byte_offsets[0], len(byte_offsets))
    end = time.time()

    print(f"Read all lines at once in {end - start} seconds")

    # Measure the time taken to read 1 state
    start = time.time()
    first_state = read_line_at_byte_offset(
        simulation_id, byte_offsets[STATE_SAVE_STEP + 1]
    )
    end = time.time()

    print(f"Read 1 state in {end - start} seconds")

    # Measure the time taken to deserialize 1 state
    start = time.time()
    VisualizedEnvironment.deserialize(first_state)
    end = time.time()

    print(f"Deserialize 1 state in {end - start} seconds")

    # Measure the time taken to deserialize all updates for a state
    updates = read_lines_from_byte_offset(
        simulation_id, byte_offsets[STATE_SAVE_STEP + 2], STATE_SAVE_STEP
    )

    start = time.time()
    for update in updates:
        Update.deserialize(update)
    end = time.time()

    print(f"Deserialize {STATE_SAVE_STEP} updates in {end - start} seconds")

    # Mesure the time taken to read deserialize 50 states
    number_of_states = 50
    start = time.time()
    all_lines = read_lines_from_byte_offset(
        simulation_id,
        byte_offsets[1],
        number_of_states * (STATE_SAVE_STEP + 1) + STATE_SAVE_STEP,
    )
    for i, line in enumerate(all_lines):
        if (i + 1) % (STATE_SAVE_STEP + 1) == 0:
            VisualizedEnvironment.deserialize(line)
        else:
            Update.deserialize(line)
    end = time.time()

    print(f"Deserialize {number_of_states} states in {end - start} seconds")
