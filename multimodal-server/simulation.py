import os
import threading
from typing import Optional

from log_manager import register_log
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.observer.visualizer import Visualizer
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event
from multimodalsim.simulator.simulator import Simulator
from socketio import Client

HOST = "127.0.0.1"
PORT = 5000


def run_simulation(simulation_id: str, data: str) -> None:
    sio = Client()

    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})

    sio.emit("simulationStart", simulation_id)

    class CustomVisualizer(Visualizer):

        def __init__(self, sio: Client) -> None:
            super().__init__()
            self.sio = sio

        def visualize_environment(
            self,
            env: Environment,
            current_event: Optional[Event] = None,
            event_index: Optional[int] = None,
            event_priority: Optional[int] = None,
        ) -> None:
            if current_event is not None:
                message = f"Visualizing environment at time {env.current_time} with event {current_event.name}"
            else:
                message = f"Visualizing environment at time {env.current_time}"

            register_log(simulation_id, message)
            self.sio.emit("log", (simulation_id, message))

    class CustomObserver(EnvironmentObserver):

        def __init__(self, sio) -> None:
            super().__init__(visualizers=CustomVisualizer(sio))

    environment_observer = CustomObserver(sio)

    current_directory = os.path.dirname(os.path.abspath(__file__))
    simulation_directory = f"{current_directory}/../data/{data}/"

    simulator = Simulator(simulation_directory, environment_observer.visualizers)
    simulation_thread = threading.Thread(target=simulator.simulate)
    simulation_thread.start()

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
