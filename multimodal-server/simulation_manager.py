import datetime
import inspect
import logging
import multiprocessing
from enum import Enum

from flask_socketio import emit
from server_utils import CLIENT_ROOM, SimulationStatus, log
from simulation import run_simulation


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

    # TODO
    # simulation_start_time: float | None
    # expected_simulation_end_time: float | None
    # configuration: MinimalistSimulationConfiguration
    # completion: float | None

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

    def on_simulation_start(self, simulation_id, socket_id):
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

    def on_simulation_end(self, simulation_id):
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
            log(
                f"{__file__} {inspect.currentframe().f_lineno}: Simulation not found",
                "server",
                logging.ERROR,
            )
            return

        simulation_id = matching_simulation_ids[0]

        simulation = self.simulations[simulation_id]

        simulation.socket_id = None
        simulation.process = None
        simulation.response_event = None

        if simulation.status == SimulationStatus.COMPLETED:
            return

        # If the simulation is not completed, it has been disconnected abnormally
        simulation.status = SimulationStatus.LOST

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
        emit(
            "simulations",
            [
                {
                    "id": simulation.simulation_id,
                    "name": simulation.name,
                    "status": simulation.status.value,
                    "startTime": simulation.start_time,
                    "data": simulation.data,
                }
                for simulation in self.simulations.values()
            ],
            to=CLIENT_ROOM,
        )

        log("Emitting simulations", "server")
