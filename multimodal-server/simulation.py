import os
import threading
from typing import Optional

from log_manager import register_log
from multimodalsim.config.simulation_config import SimulationConfig
from multimodalsim.observer.data_collector import DataCollector
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.observer.visualizer import Visualizer
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event
from multimodalsim.simulator.simulator import Simulator
from server_utils import HOST, PORT, SimulationStatus
from simulation_visualization_data_collector import (
    SimulationVisualizationEnvironmentObserver,
)
from socketio import Client


def run_simulation(simulation_id: str, data: str) -> None:
    sio = Client()

    status = SimulationStatus.STARTING

    @sio.on("pause-simulation")
    def pauseSimulator():
        simulator.pause()
        sio.emit("simulation-pause", simulation_id)
        status = SimulationStatus.PAUSED

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
            (simulation_id, data, status.value),
        )

    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})

    environment_observer = SimulationVisualizationEnvironmentObserver(
        simulation_id, data, sio
    )

    current_directory = os.path.dirname(os.path.abspath(__file__))
    simulation_data_directory = f"{current_directory}/../data/{data}/"

    simulator = Simulator(
        simulation_data_directory,
        visualizers=environment_observer.visualizers,
        data_collectors=environment_observer.data_collectors,
    )
    simulation_thread = threading.Thread(target=simulator.simulate)
    simulation_thread.start()

    sio.emit("simulation-start", simulation_id)

    status = SimulationStatus.RUNNING

    # Wait for the simulation to end
    simulation_thread.join()

    # Notify the server that the simulation has ended
    if sio.connected:
        sio.emit("simulation-end", simulation_id)

    # Wait for the socket to disconnect
    sio.wait()
