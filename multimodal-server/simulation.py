import os
import threading

from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.simulator.simulator import Simulator
from server_utils import (
    HOST,
    PORT,
    SimulationStatus,
    build_simulation_id,
    get_available_data,
    verify_simulation_name,
)
from simulation_visualization_data_collector import (
    SimulationVisualizationEnvironmentObserver,
)
from socketio import Client


def run_simulation(simulation_id: str, data: str, max_time: float | None) -> None:
    sio = Client(reconnection_attempts=1)

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

    @sio.on("connect")
    def on_connect():
        sio.emit(
            "simulation-identification",
            (
                simulation_id,
                data,
                environment_observer.data_collector.simulation_information.simulation_start_time,
                environment_observer.data_collector.visualized_environment.timestamp,
                environment_observer.data_collector.visualized_environment.estimated_end_time,
                environment_observer.max_time,
                status.value,
            ),
        )

    @sio.on("edit-simulation-configuration")
    def on_edit_simulation_configuration(max_time: float | None):
        environment_observer.max_time = max_time

    try:
        sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})
    except Exception as e:
        print(f"Failed to connect to server: {e}")
        print("Running in offline mode")

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

    # Listen for a keyboard interrupt
    try:
        # Wait for the thread to finish while checking for keyboard interrupts
        while simulation_thread.is_alive():
            simulation_thread.join(timeout=1)
            if not sio.connected and status != SimulationStatus.STOPPING:
                try:
                    print("Trying to reconnect")
                    sio.connect(f"http://{HOST}:{PORT}", auth={"type": "simulation"})
                except Exception as e:
                    print(f"Failed to connect to server: {e}")
                    print("Continuing in offline mode")

    except KeyboardInterrupt:
        print("Ending simulation")
        status = SimulationStatus.STOPPING
        simulator.stop()

    # Wait for the simulation to end
    simulation_thread.join()

    if sio.connected:
        sio.disconnect()


if __name__ == "__main__":
    import argparse

    import questionary

    parser = argparse.ArgumentParser(description="Run a simulation")
    parser.add_argument("--name", type=str, help="The name of the simulation")
    parser.add_argument("--data", type=str, help="The data to use for the simulation")
    parser.add_argument(
        "--max-time", type=float, help="The maximum time to run the simulation"
    )

    args = parser.parse_args()

    name = args.name
    data = args.data
    max_time = args.max_time

    name_error = verify_simulation_name(name)

    while name_error is not None:
        print(f"Error: {name_error}")
        name = questionary.text(
            "Enter the name of the simulation (spaces will be replaced by underscores)"
        ).ask()
        name_error = verify_simulation_name(name)

    name = name.replace(" ", "_")

    available_data = get_available_data()

    if len(available_data) == 0:
        print("No input data is available, please provide some in the data folder")
        exit(1)

    if data is None:
        # Get all available data

        data = questionary.select(
            "Select the data to use for the simulation",
            choices=available_data,
        ).ask()

        print("Selected data:", data)

    if data not in available_data:
        print("The provided data is not available")
        exit(1)

    simulation_id, _ = build_simulation_id(name)

    print(
        f"Running simulation with id: {simulation_id}, data: {data} and {f'max time: {max_time}' if max_time is not None else 'no max time'}"
    )

    run_simulation(simulation_id, data, max_time)

    print("To run a simulation with the same configuration, use the following command:")
    print(
        f"python --name simulation.py {name} --data {data}{f' --max-time {max_time}' if max_time is not None else ''}"
    )
