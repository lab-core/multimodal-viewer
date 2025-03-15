import datetime
import inspect
import logging
import multiprocessing

from flask_socketio import emit
from server_utils import (
    CLIENT_ROOM,
    SAVE_VERSION,
    SIMULATION_SAVE_FILE_SEPARATOR,
    SimulationStatus,
    get_session_id,
    log,
)
from simulation import run_simulation
from simulation_visualization_data_model import (
    SimulationInformation,
    SimulationVisualizationDataManager,
)


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

    max_time: float | None

    def __init__(
        self,
        simulation_id: str,
        name: str,
        start_time: float,
        data: str,
        status: SimulationStatus,
        max_time: float | None,
        process: multiprocessing.Process | None,
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

        self.max_time = max_time


class SimulationManager:
    simulations: dict[str, SimulationHandler]

    def __init__(self):
        self.simulations = {}

    def start_simulation(
        self, name: str, data: str, response_event: str, max_time: float | None
    ) -> SimulationHandler:
        # Get the current time
        start_time = datetime.datetime.now().strftime("%Y%m%d-%H%M%S%f")
        # Remove microseconds
        start_time = start_time[:-3]

        # Start time first to sort easily
        simulation_id = f"{start_time}{SIMULATION_SAVE_FILE_SEPARATOR}{name}"

        simulation_process = multiprocessing.Process(
            target=run_simulation, args=(simulation_id, data, max_time)
        )

        simulation_handler = SimulationHandler(
            simulation_id,
            name,
            start_time,
            data,
            SimulationStatus.STARTING,
            max_time,
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

    def edit_simulation_configuration(
        self, simulation_id: str, max_time: float | None
    ) -> None:
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        simulation = self.simulations[simulation_id]

        simulation.max_time = max_time

        emit("edit-simulation-configuration", (max_time,), to=simulation.socket_id)

        self.emit_simulations()

        log(
            f"Emitted simulations with new max time {max_time} for simulation {simulation_id}",
            "server",
            logging.WARN,
        )

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

            if simulation.max_time is not None:
                serialized_simulation["configuration"] = {
                    "maxTime": simulation.max_time
                }

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
        last_state_order: float,
        visualization_time: float,
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
            (missing_states, state_orders_to_keep, missing_updates) = (
                SimulationVisualizationDataManager.get_missing_states(
                    simulation_id,
                    first_state_order,
                    last_state_order,
                    visualization_time,
                )
            )

            self.emit_simulation_polylines(simulation_id)

            emit(
                "missing-simulation-states",
                (missing_states, state_orders_to_keep, missing_updates),
                to=get_session_id(),
            )

        except Exception as e:
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

            SimulationVisualizationDataManager.mark_simulation_as_corrupted(
                simulation_id
            )

            self.emit_simulations()

    def emit_simulation_polylines(self, simulation_id):
        if simulation_id not in self.simulations:
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation {simulation_id} not found",
                "server",
                logging.ERROR,
            )
            return

        polylines = SimulationVisualizationDataManager.get_polylines(simulation_id)

        emit(f"polylines-{simulation_id}", polylines, to=CLIENT_ROOM)

    def query_simulations(self):
        all_simulation_ids = (
            SimulationVisualizationDataManager.get_all_saved_simulation_ids()
        )

        for simulation_id, _ in list(self.simulations.items()):
            if (
                simulation_id not in all_simulation_ids
                and self.simulations[simulation_id].status
                not in [
                    SimulationStatus.RUNNING,
                    SimulationStatus.PAUSED,
                    SimulationStatus.STOPPING,
                    SimulationStatus.STARTING,
                    SimulationStatus.LOST,
                ]
            ):
                del self.simulations[simulation_id]

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

                simulation.simulation_start_time = (
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
                None,
                None,
            )

            self.simulations[simulation_id] = simulation

            SimulationVisualizationDataManager.mark_simulation_as_corrupted(
                simulation_id
            )
