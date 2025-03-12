import os
import threading

from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.simulator.simulator import Simulator
from server_utils import HOST, PORT, SimulationStatus
from simulation_visualization_data_collector import (
    SimulationVisualizationEnvironmentObserver,
)
from socketio import Client


def run_simulation(simulation_id: str, data: str, max_time: float | None) -> None:
    sio = Client()

    status = SimulationStatus.STARTING

    environment_observer = SimulationVisualizationEnvironmentObserver(
        simulation_id, data, sio, max_time
    )

    @sio.on("pause-simulation")
    def pauseSimulator():
        simulator.pause()
        status = SimulationStatus.PAUSED
        sio.emit("simulation-pause", simulation_id)

    @sio.on("resume-simulation")
    def resumeSimulator():
        simulator.resume()
        sio.emit("simulation-resume", simulation_id)
        status = SimulationStatus.RUNNING

    @sio.on("stop-simulation")
    def stopSimulator():
        simulator.stop()
        status = SimulationStatus.STOPPING

    @sio.on("can-disconnect")
    def canDisconnect():
        sio.disconnect()

    @sio.on("connect")
    def on_connect():
        sio.emit(
            "simulation-identification",
            (
                simulation_id,
                environment_observer.data_collector.visualized_environment.timestamp,
                environment_observer.data_collector.visualized_environment.estimated_end_time,
                status.value,
            ),
        )

    @sio.on("edit-simulation-configuration")
    def on_edit_simulation_configuration(max_time: float | None):
        environment_observer.max_time = max_time

    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})

    current_directory = os.path.dirname(os.path.abspath(__file__))
    simulation_data_directory = f"{current_directory}/../data/{data}/"

    simulator = Simulator(
        simulation_data_directory,
        visualizers=environment_observer.visualizers,
        data_collectors=environment_observer.data_collectors,
    )
    simulation_thread = threading.Thread(target=simulator.simulate)
    simulation_thread.start()

    status = SimulationStatus.RUNNING

    # Wait for the simulation to end
    simulation_thread.join()

    # Wait for the socket to disconnect
    sio.wait()
