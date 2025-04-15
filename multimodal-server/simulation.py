import os
import threading

from multimodalsim.observer.data_collector import DataContainer, StandardDataCollector
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.simulator.simulator import Simulator
from multimodalsim.statistics.data_analyzer import FixedLineDataAnalyzer
from server_utils import (
    build_simulation_id,
    get_available_data,
    set_event_on_input,
    verify_simulation_name,
)
from simulation_visualization_data_collector import SimulationVisualizationDataCollector


def run_simulation(
    simulation_id: str,
    data: str,
    max_duration: float | None,
    stop_event: threading.Event | None = None,
    is_offline: bool = False,
) -> None:
    data_container = DataContainer()

    data_collector = SimulationVisualizationDataCollector(
        FixedLineDataAnalyzer(data_container),
        max_duration=max_duration,
        simulation_id=simulation_id,
        input_data_description=data,
        offline=is_offline,
    )

    environment_observer = EnvironmentObserver(
        [StandardDataCollector(data_container), data_collector],
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

    # Wait for the simulation to finish
    while simulation_thread.is_alive() and (
        stop_event is None or not stop_event.is_set()
    ):
        simulation_thread.join(timeout=5)  # Check every 5 seconds

    if simulation_thread.is_alive():
        print("Simulation is still running, stopping it")
        simulator.stop()

    simulation_thread.join()

    if stop_event is not None:
        stop_event.set()


if __name__ == "__main__":
    import argparse

    import questionary

    parser = argparse.ArgumentParser(description="Run a simulation")
    parser.add_argument("--name", type=str, help="The name of the simulation")
    parser.add_argument("--data", type=str, help="The data to use for the simulation")
    parser.add_argument(
        "--max-duration", type=float, help="The maximum duration to run the simulation"
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Run the simulation in offline mode without requiring internet access",
    )

    args = parser.parse_args()

    name = args.name
    data = args.data
    max_duration = args.max_duration
    is_offline = args.offline

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
        f"Running simulation with id: {simulation_id}, data: {data} and {f'max duration: {max_duration}' if max_duration is not None else 'no max duration'}{is_offline and ' in offline mode' or ''}"
    )

    stop_event = threading.Event()
    input_listener_thread = threading.Thread(
        target=set_event_on_input,
        args=("stop the simulation", "q", stop_event),
        name="InputListener",
        # This is a daemon thread, so it will be
        # automatically terminated when the main thread is terminated.
        daemon=True,
    )

    input_listener_thread.start()

    run_simulation(simulation_id, data, max_duration, stop_event, is_offline)

    print("To run a simulation with the same configuration, use the following command:")
    print(
        f"python simulation.py  --data {data}{f' --max-duration {max_duration}' if max_duration is not None else ''} --name {name}{f' --offline' if is_offline else ''}"
    )
