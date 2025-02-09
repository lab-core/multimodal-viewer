import os
import threading
from typing import Optional

from log_manager import register_log
from multimodalsim.observer.data_collector import DataCollector
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.observer.visualizer import Visualizer
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event
from multimodalsim.simulator.simulator import Simulator
from server_utils import HOST, PORT
from simulation_event_manager import SimulationEventManager
from socketio import Client


def run_simulation(simulation_id: str, data: str) -> None:
    sio = Client()

    simulation_event_manager = SimulationEventManager(simulation_id, sio)

    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})

    class CustomVisualizer(Visualizer):

        def __init__(self) -> None:
            super().__init__()

        def visualize_environment(
            self,
            env: Environment,
            current_event: Optional[Event] = None,
            event_index: Optional[int] = None,
            event_priority: Optional[int] = None,
        ) -> None:
            pass

    class CustomDataCollector(DataCollector):

        def __init__(self) -> None:
            super().__init__()
            self.sio = sio
            self.simulation_event_manager = simulation_event_manager

        def collect(
            self,
            env: Environment,
            current_event: Optional[Event] = None,
            event_index: Optional[int] = None,
            event_priority: Optional[int] = None,
        ) -> None:

            if current_event is None:
                # End of simulation
                message = "Simulation ended"
                if not sio.connected:
                    sio.emit("simulationEnd", simulation_id)
            else:
                message = self.simulation_event_manager.process_event(
                    current_event, env
                )

            message = "ERROR: No message" if message is None else message
            register_log(simulation_id, message)
            if sio.connected:
                self.sio.emit("log", (simulation_id, message))

    class CustomObserver(EnvironmentObserver):

        def __init__(self) -> None:
            super().__init__(
                visualizers=CustomVisualizer(), data_collectors=CustomDataCollector()
            )

    environment_observer = CustomObserver()

    current_directory = os.path.dirname(os.path.abspath(__file__))
    simulation_directory = f"{current_directory}/../data/{data}/"

    simulator = Simulator(
        simulation_directory,
        visualizers=environment_observer.visualizers,
        data_collectors=environment_observer.data_collectors,
    )
    simulation_thread = threading.Thread(target=simulator.simulate)
    simulation_thread.start()

    sio.emit("simulationStart", simulation_id)

    # In simulation event
    @sio.on("pauseSimulation")
    def pauseSimulator():
        sio.emit("simulationPause", simulation_id)
        simulator.pause()

    @sio.on("resumeSimulation")
    def resumeSimulator():
        sio.emit("simulationResume", simulation_id)
        simulator.resume()

    @sio.on("stopSimulation")
    def stopSimulator():
        # TODO Ask
        simulator.resume()
        simulator.stop()
        sio.emit("simulationEnd", simulation_id)

    @sio.on("canDisconnect")
    def canDisconnect():
        sio.disconnect()

    simulation_thread.join()
    sio.wait()
