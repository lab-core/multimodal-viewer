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


def run_simulation(name):
    sio = Client()

    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})

    sio.emit("simulationStart", name)

    class CustomVisualizer(Visualizer):

        def __init__(self, sio) -> None:
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
                log_message = f"Visualizing environment at time {env.current_time} with event {current_event.name}"
            else:
                log_message = f"Visualizing environment at time {env.current_time}"

            # logging.info(log_message)
            register_log(name, log_message)
            self.sio.emit("log", {"name": name, "message": log_message})

    class CustomObserver(EnvironmentObserver):

        def __init__(self, sio) -> None:
            super().__init__(visualizers=CustomVisualizer(sio))

    # Initialize the observer.
    environment_observer = CustomObserver(sio)

    # Set directory TODO
    simulation_directory = "../data/instance_19/"

    simulator = Simulator(simulation_directory, environment_observer.visualizers)
    simulation_thread = threading.Thread(target=simulator.simulate, name=name)
    simulation_thread.start()

    # In simulation event
    @sio.on("pauseSimulation")
    def pauseSimulator():
        sio.emit("simulationPause", name)
        simulator.pause()

    @sio.on("resumeSimulation")
    def resumeSimulator():
        sio.emit("simulationResume", name)
        simulator.resume()

    @sio.on("stopSimulation")
    def stopSimulator():
        simulator.stop()
        simulation_thread.join()
        sio.emit("simulationEnd", name)
        sio.disconnect()

    simulation_thread.join()
    if sio.connected:
        sio.emit("simulationEnd", name)
        sio.disconnect()
