import inspect
import logging
import multiprocessing

from flask_socketio import emit

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
from multimodalsim_viewer.server.simulation import run_simulation
from multimodalsim_viewer.server.simulation_visualization_data_model import (
    SimulationVisualizationDataManager,
)


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


class SimulationManager:
    simulations: dict[str, SimulationHandler]

    def __init__(self):
        self.simulations = {}

    def start_simulation(
        self, name: str, data: str, response_event: str, max_duration: float | None
    ) -> SimulationHandler:
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

        emit("edit-simulation-configuration", (max_duration,), to=simulation.socket_id)

        self.emit_simulations()

        log(
            f"Emitted simulations with new max duration {max_duration} for simulation {simulation_id}",
            "server",
            logging.WARN,
        )

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

        self.emit_simulations()

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

        self.emit_simulations()

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
        visualization_time: float,
        loaded_state_orders: list[int],
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
            (
                missing_states,
                missing_updates,
                state_orders_to_keep,
                should_request_more,
                first_continuous_state_order,
                last_continuous_state_order,
                necessary_state_order,
            ) = SimulationVisualizationDataManager.get_missing_states(
                simulation_id,
                visualization_time,
                loaded_state_orders,
                simulation.status not in RUNNING_SIMULATION_STATUSES,
            )

            emit(
                "missing-simulation-states",
                (
                    missing_states,
                    missing_updates,
                    state_orders_to_keep,
                    should_request_more,
                    first_continuous_state_order,
                    last_continuous_state_order,
                    necessary_state_order,
                ),
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

            self.emit_simulations()

    def emit_simulation_polylines(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        polylines, version = SimulationVisualizationDataManager.get_polylines(simulation_id)

        emit(f"polylines-{simulation_id}", (polylines, version), to=CLIENT_ROOM)

    def query_simulations(self):
        all_simulation_ids = SimulationVisualizationDataManager.get_all_saved_simulation_ids()

        for simulation_id, _ in list(self.simulations.items()):
            if simulation_id not in all_simulation_ids and self.simulations[simulation_id].status not in [
                SimulationStatus.RUNNING,
                SimulationStatus.PAUSED,
                SimulationStatus.STOPPING,
                SimulationStatus.STARTING,
                SimulationStatus.LOST,
            ]:
                del self.simulations[simulation_id]

        for simulation_id in all_simulation_ids:
            # Non valid save files might throw an exception
            self.query_simulation(simulation_id)

    def query_simulation(self, simulation_id) -> None:
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
            log(f"Simulation {simulation_id} is corrupted", "server", logging.DEBUG)

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
