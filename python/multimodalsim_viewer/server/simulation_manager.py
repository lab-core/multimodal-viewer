import dataclasses
import inspect
import logging
import multiprocessing
import time
from threading import Thread

from flask_socketio import SocketIO

from multimodalsim_viewer.common.utils import (
    CLIENT_ROOM,
    RUNNING_SIMULATION_STATUSES,
    SAVE_VERSION,
    SIMULATION_SAVE_FILE_SEPARATOR,
    SimulationStatus,
    build_simulation_id,
    get_session_id,
    log,
)
from multimodalsim_viewer.server.data_manager import SimulationVisualizationDataManager
from multimodalsim_viewer.server.simulation import run_simulation


class SimulationHandler:  # pylint: disable=too-many-instance-attributes, too-few-public-methods
    simulation_id: str
    name: str
    start_time: float
    data: str
    process: multiprocessing.Process | None
    status: SimulationStatus
    size: int | None

    socket_id: str | None

    simulation_start_time: float | None
    simulation_end_time: float | None

    simulation_time: float | None
    simulation_estimated_end_time: float | None

    max_duration: float | None

    polylines_version: int | None

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        simulation_id: str,
        name: str,
        start_time: float,
        data: str,
        status: SimulationStatus,
        max_duration: float | None,
        process: multiprocessing.Process | None,
    ) -> None:
        self.simulation_id = simulation_id
        self.name = name
        self.start_time = start_time
        self.data = data
        self.process = process
        self.status = status
        self.size = None

        self.socket_id = None

        self.simulation_start_time = None
        self.simulation_end_time = None
        self.simulation_time = None
        self.simulation_estimated_end_time = None

        self.max_duration = max_duration

        self.polylines_version = None


@dataclasses.dataclass
class ScheduledTask:
    task: Thread | None
    last_run: float | None = None


class SimulationManager:
    def __init__(self, socketio: SocketIO):
        self.socketio = socketio

        self.simulations = {}

        self.task_by_simulation_id: dict[str, ScheduledTask] = {}

    def start_simulation(self, name: str, data: str, response_event: str, max_duration: float | None):
        simulation_id, start_time = build_simulation_id(name)

        simulation_process = multiprocessing.Process(
            target=run_simulation,
            args=(simulation_id, data, max_duration),
            name="multimodalsim_viewer_simulation_" + simulation_id,
        )

        simulation_handler = SimulationHandler(
            simulation_id,
            name,
            start_time,
            data,
            SimulationStatus.STARTING,
            max_duration,
            simulation_process,
        )

        self.simulations[simulation_id] = simulation_handler

        simulation_process.start()

        log(f'Emitting response event "{response_event}"', "server")

        self.socketio.emit(response_event, simulation_id, to=CLIENT_ROOM)

        log(f"Started simulation {simulation_id}", "server")

        self.emit_simulation(simulation_id)

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

        log(f"Simulation {simulation_id} started", "server")

        self.emit_simulation(simulation_id)

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

        self.socketio.emit("stop-simulation", to=simulation.socket_id)

        log(f"Stopping simulation {simulation_id}", "server")

        self.emit_simulation(simulation_id)

    def pause_simulation(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        self.socketio.emit("pause-simulation", to=simulation.socket_id)

        log(f"Pausing simulation {simulation_id}", "server")

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

        log(f"Simulation {simulation_id} paused", "server")

        self.emit_simulation(simulation_id)

    def resume_simulation(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        self.socketio.emit("resume-simulation", to=simulation.socket_id)

        log(f"Resuming simulation {simulation_id}", "server")

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

        log(f"Simulation {simulation_id} resumed", "server")

        self.emit_simulation(simulation_id)

    def edit_simulation_configuration(self, simulation_id: str, max_duration: float | None) -> None:
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.max_duration = max_duration

        self.socketio.emit("edit-simulation-configuration", (max_duration,), to=simulation.socket_id)

        log(f"Edited simulation {simulation_id} configuration", "server")

        self.emit_simulation(simulation_id)

    def on_simulation_disconnect(self, socket_id):
        matching_simulation_ids = [
            simulation_id for simulation_id, simulation in self.simulations.items() if simulation.socket_id == socket_id
        ]

        if len(matching_simulation_ids) != 1:
            # The simulation has already been disconnected properly
            return

        simulation_id = matching_simulation_ids[0]

        # Get the simulation information from the save file
        simulation_information = SimulationVisualizationDataManager.get_simulation_information(simulation_id)

        simulation = self.simulations[simulation_id]

        if simulation.status in RUNNING_SIMULATION_STATUSES:
            if simulation_information.simulation_end_time is None:
                # The simulation has been lost
                simulation.status = SimulationStatus.LOST
            else:
                # The simulation has been completed
                simulation.status = SimulationStatus.COMPLETED

        simulation.socket_id = None

        log(f"Simulation {simulation_id} disconnected", "server")

        self.emit_simulation(simulation_id)

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

        log(f"Simulation {simulation_id} time updated to {timestamp}", "server")

        self.emit_simulation(simulation_id)

    def on_simulation_update_estimated_end_time(self, simulation_id, estimated_end_time):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.simulation_estimated_end_time = estimated_end_time

        log(f"Simulation {simulation_id} estimated end time updated to {estimated_end_time}", "server")

        self.emit_simulation(simulation_id)

    def on_simulation_update_polylines_version(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.polylines_version = SimulationVisualizationDataManager.get_polylines_version_with_lock(simulation_id)

        log(f"Simulation {simulation_id} polylines version updated", "server")

        self.emit_simulation(simulation_id)

    def on_simulation_identification(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        simulation_id,
        data,
        simulation_start_time,
        simulation_time,
        simulation_estimated_end_time,
        max_duration,
        status,
        socket_id,
    ):
        log(
            f"Identifying simulation {simulation_id}",
            "simulation",
        )

        start_time, name = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)

        if simulation_id in self.simulations:
            simulation = self.simulations[simulation_id]
        else:
            start_time, name = simulation_id.split(SIMULATION_SAVE_FILE_SEPARATOR)

            simulation = SimulationHandler(
                simulation_id,
                name,
                start_time,
                data,
                SimulationStatus(status),
                max_duration,
                None,
            )

            self.simulations[simulation_id] = simulation

        simulation.name = name
        simulation.start_time = start_time
        simulation.data = data
        simulation.simulation_start_time = simulation_start_time
        simulation.simulation_time = simulation_time
        simulation.simulation_estimated_end_time = simulation_estimated_end_time
        simulation.max_duration = max_duration
        simulation.status = SimulationStatus(status)
        simulation.socket_id = socket_id

        simulation.polylines_version = SimulationVisualizationDataManager.get_polylines_version_with_lock(simulation_id)

        self.emit_simulation(simulation_id)

    def emit_simulation_polylines(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        polylines, version = SimulationVisualizationDataManager.get_polylines(simulation_id)

        self.socketio.emit(f"polylines-{simulation_id}", (polylines, version), to=CLIENT_ROOM)

        log(f"Emitted polylines for simulation {simulation_id}", "server")

    def emit_simulations(self, loaded_simulations_ids: list[str]):
        all_simulation_ids = SimulationVisualizationDataManager.get_all_saved_simulation_ids()

        log("Emitting simulations", "server")

        simulation_ids_to_delete: set[str] = set()

        for simulation_id, _ in list(self.simulations.items()):
            if simulation_id not in all_simulation_ids and self.simulations[simulation_id].status not in [
                SimulationStatus.RUNNING,
                SimulationStatus.PAUSED,
                SimulationStatus.STOPPING,
                SimulationStatus.STARTING,
                SimulationStatus.LOST,
            ]:
                simulation_ids_to_delete.add(simulation_id)

        for loaded_simulation_id in loaded_simulations_ids:
            if not loaded_simulation_id in all_simulation_ids:
                simulation_ids_to_delete.add(loaded_simulation_id)

        for simulation_id in simulation_ids_to_delete:
            self.on_simulation_delete(simulation_id)

        for simulation_id in all_simulation_ids:
            self.emit_simulation(simulation_id)

        log("Emitted simulations", "server")

    def on_simulation_delete(self, simulation_id: str) -> None:
        if simulation_id in self.simulations:
            del self.simulations[simulation_id]

        self.socketio.emit("delete-simulation", simulation_id, to=CLIENT_ROOM)

        log(f"Deleted simulation {simulation_id} from simulation manager", "server")

    def emit_missing_simulation_states(
        self,
        simulation_id: str,
        visualization_time: float,
        complete_state_update_indexes: list[int],
    ) -> None:
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        try:
            (missing_states, missing_updates, has_all_states) = SimulationVisualizationDataManager.get_missing_states(
                simulation_id,
                visualization_time,
                complete_state_update_indexes,
                simulation.status not in RUNNING_SIMULATION_STATUSES,
            )

            self.socketio.emit(
                "missing-simulation-states",
                (missing_states, missing_updates, has_all_states),
                to=get_session_id(),
            )

        except Exception as e:  # pylint: disable=broad-exception-caught
            log(
                f"Error while emitting missing simulation states for {simulation_id}: {e}",
                "server",
                logging.ERROR,
            )
            log(
                f"Marking simulation {simulation_id} as corrupted",
                "server",
                logging.ERROR,
            )

            simulation.status = SimulationStatus.CORRUPTED

            SimulationVisualizationDataManager.mark_simulation_as_corrupted(simulation_id)

            self.emit_simulation(simulation_id)

    def emit_simulation(self, simulation_id: str) -> None:
        scheduled_task = self.task_by_simulation_id.get(simulation_id, None)
        if scheduled_task is None:
            scheduled_task = ScheduledTask(None)
            self.task_by_simulation_id[simulation_id] = scheduled_task

        minimum_debounce_time = 1
        actual_debounce_time = 0
        now = time.monotonic()

        if scheduled_task.last_run is not None and scheduled_task.last_run + minimum_debounce_time > now:
            actual_debounce_time = scheduled_task.last_run + minimum_debounce_time - now

        def action():
            self.socketio.sleep(actual_debounce_time)

            try:
                self.query_simulation(simulation_id)

                log(f"Emitting simulation {simulation_id}", "server")

                simulation = self.simulations[simulation_id]

                serialized_simulation = {
                    "id": simulation_id,
                    "name": simulation.name,
                    "status": simulation.status.value,
                    "startTime": simulation.start_time,
                    "data": simulation.data,
                }

                if simulation.simulation_start_time is not None:
                    serialized_simulation["simulationStartTime"] = simulation.simulation_start_time

                if simulation.simulation_end_time is not None:
                    serialized_simulation["simulationEndTime"] = simulation.simulation_end_time

                if simulation.simulation_time is not None:
                    serialized_simulation["simulationTime"] = simulation.simulation_time

                if simulation.simulation_estimated_end_time is not None:
                    serialized_simulation["simulationEstimatedEndTime"] = simulation.simulation_estimated_end_time

                if simulation.max_duration is not None:
                    serialized_simulation["configuration"] = {"maxDuration": simulation.max_duration}

                if simulation.polylines_version is not None:
                    serialized_simulation["polylinesVersion"] = simulation.polylines_version

                if simulation.size is not None:
                    serialized_simulation["size"] = simulation.size

                self.socketio.emit("simulation", serialized_simulation, to=CLIENT_ROOM)

                log(f"Emitted simulation {simulation_id}", "server")

            except Exception as e:  # pylint: disable=broad-exception-caught
                log(
                    f"Error while emitting simulation {simulation_id}: {e}",
                    "server",
                    logging.ERROR,
                )
            finally:
                scheduled_task.last_run = time.monotonic()
                scheduled_task.task = None

        if scheduled_task.task is None:
            if actual_debounce_time > 0:
                scheduled_task.task = self.socketio.start_background_task(action)
                log(f"Scheduled emit of simulation {simulation_id} in {actual_debounce_time}s", "server")
            else:
                action()
                log(f"Emitted simulation {simulation_id} immediately", "server")
        else:
            log(f"Simulation {simulation_id} is already scheduled", "server")

    def query_simulation(self, simulation_id) -> None:
        log(f"Querying simulation {simulation_id}", "server")

        if simulation_id in self.simulations and self.simulations[simulation_id].status in [
            SimulationStatus.RUNNING,
            SimulationStatus.PAUSED,
            SimulationStatus.STOPPING,
            SimulationStatus.STARTING,
            SimulationStatus.LOST,
        ]:
            simulation = self.simulations[simulation_id]
            simulation.size = SimulationVisualizationDataManager.get_saved_simulation_size(simulation_id)
            return

        is_corrupted = SimulationVisualizationDataManager.is_simulation_corrupted(simulation_id)

        if not is_corrupted:
            # Non valid save files throw an exception
            try:
                # Get the simulation information from the save file
                simulation_information = SimulationVisualizationDataManager.get_simulation_information(simulation_id)

                # Get the version of the polylines
                polylines_version = SimulationVisualizationDataManager.get_polylines_version_with_lock(simulation_id)

                # Verify the version of the save file
                version = simulation_information.version

                status = SimulationStatus.COMPLETED
                if version < SAVE_VERSION:
                    status = SimulationStatus.OUTDATED
                elif version > SAVE_VERSION:
                    status = SimulationStatus.FUTURE

                if status == SimulationStatus.OUTDATED:
                    log(
                        f"Simulation {simulation_id} version is outdated",
                        "server",
                    )
                if status == SimulationStatus.FUTURE:
                    log(
                        f"Simulation {simulation_id} version is future",
                        "server",
                    )

                simulation = SimulationHandler(
                    simulation_id,
                    simulation_information.name,
                    simulation_information.start_time,
                    simulation_information.data,
                    status,
                    None,
                    None,
                )

                simulation.size = SimulationVisualizationDataManager.get_saved_simulation_size(simulation_id)

                simulation.simulation_start_time = simulation_information.simulation_start_time
                simulation.simulation_end_time = simulation_information.simulation_end_time

                simulation.polylines_version = polylines_version

                if simulation_information.simulation_end_time is None:
                    # The simulation is not running but the end time is not set
                    raise Exception("Simulation is corrupted")  # pylint: disable=broad-exception-raised

                self.simulations[simulation_id] = simulation

            except Exception:  # pylint: disable=broad-exception-caught
                is_corrupted = True

        if is_corrupted:
            log(f"Simulation {simulation_id} is corrupted", "server")

            simulation = SimulationHandler(
                simulation_id,
                "unknown",
                "unknown",
                "unknown",
                SimulationStatus.CORRUPTED,
                None,
                None,
            )

            self.simulations[simulation_id] = simulation

            SimulationVisualizationDataManager.mark_simulation_as_corrupted(simulation_id)
        else:
            log(f"Simulation {simulation_id} queried successfully", "server")
