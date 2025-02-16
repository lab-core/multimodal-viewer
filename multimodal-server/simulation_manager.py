import datetime
import inspect
import logging
import multiprocessing
import os
import tempfile
from enum import Enum

from flask_socketio import emit
from server_utils import (
    CLIENT_ROOM,
    SAVE_VERSION,
    STATE_SAVE_STEP,
    SimulationStatus,
    log,
)
from simulation import run_simulation
from simulation_visualization_data_model import (
    SimulationInformation,
    Update,
    VisualizedEnvironment,
    extract_indexes,
    get_simulation_save_directory_path,
    get_simulation_save_file_path,
    read_line_at_index,
    read_lines_from_index,
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
    indexes: list[int] = []

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
        self.query_simulations()

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

    def on_simulation_end(self, simulation_id: str, simulation_end_time: float):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        # Update the simulation end time in the save file
        with open(
            get_simulation_save_file_path(simulation_id), "r+", encoding="utf-8"
        ) as file, tempfile.NamedTemporaryFile(mode="w", delete=False) as temp_file:
            first_line = file.readline()

            simulation_information = SimulationInformation.deserialize(first_line)
            simulation_information.simulation_end_time = simulation_end_time

            temp_file.write(str(simulation_information.serialize()) + "\n")
            temp_file.write(file.read())

        os.replace(temp_file.name, get_simulation_save_file_path(simulation_id))

        # Reload the simulation
        self.query_simulation(simulation_id)

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

    def on_simulation_identification(self, simulation_id, data, status, socket_id):
        if (
            simulation_id in self.simulations
            and self.simulations[simulation_id].status != SimulationStatus.LOST
        ):
            return

        log(
            f"Identifying simulation {simulation_id} with data {data} and status {status}",
            "simulation",
        )

        name = simulation_id.split("-")[2]
        start_time = "-".join(simulation_id.split("-")[:2])

        simulation = SimulationHandler(
            simulation_id,
            name,
            start_time,
            data,
            SimulationStatus[status],
        )

        simulation.socket_id = socket_id

        self.simulations[simulation_id] = simulation

        self.emit_simulations()

    def emit_simulations(self):
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

    def query_simulations(self):
        simulation_save_directory_path = get_simulation_save_directory_path()

        simulation_ids = [
            file_name.split(".")[0]
            for file_name in os.listdir(simulation_save_directory_path)
        ]

        for simulation_id in simulation_ids:
            # Non valid save files might throw an exception
            self.query_simulation(simulation_id)

    def query_simulation(self, simulation_id) -> None:
        # Non valid save files might throw an exception
        try:
            indexes = extract_indexes(simulation_id)
            if len(indexes) == 0:
                return

            first_line = read_line_at_index(simulation_id, indexes[0])

            simulation_information = SimulationInformation.deserialize(first_line)

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
                    should_emit=False,
                )
            if status == SimulationStatus.FUTURE:
                log(
                    f"Simulation {simulation_id} version is future",
                    "server",
                    should_emit=False,
                )

            simulation = SimulationHandler(
                simulation_id,
                simulation_information.name,
                simulation_information.start_time,
                simulation_information.data,
                status,
            )

            if simulation_information.simulation_start_time is not None:
                simulation.simulation_start_time = (
                    simulation_information.simulation_start_time
                )

            if simulation_information.simulation_end_time is not None:
                simulation.simulation_end_time = (
                    simulation_information.simulation_end_time
                )
            elif simulation_id in self.simulations:
                # The simulation is currently running
                return
            else:
                raise Exception("Simulation is corrupted")

            simulation.indexes = indexes

            self.simulations[simulation_id] = simulation

        except:
            log(
                f"Simulation {simulation_id} is corrupted",
                "server",
                should_emit=False,
            )

            simulation = SimulationHandler(
                simulation_id,
                "unknown",
                "unknown",
                "unknown",
                SimulationStatus.CORRUPTED,
            )

            self.simulations[simulation_id] = simulation
