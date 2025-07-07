import argparse
import os
import sys
import threading
from argparse import ArgumentParser, Namespace

import questionary
from multimodalsim.observer.data_collector import DataContainer, StandardDataCollector
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.simulator.simulator import Simulator
from multimodalsim.statistics.data_analyzer import FixedLineDataAnalyzer

from multimodalsim_viewer.common.utils import (
    build_simulation_id,
    get_available_data,
    get_input_data_directory_path,
    set_event_on_input,
    verify_simulation_name,
)
from multimodalsim_viewer.server.simulation_visualization_data_collector import (
    SimulationVisualizationDataCollector,
)


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
        stop_event=stop_event,
    )

    environment_observer = EnvironmentObserver(
        [StandardDataCollector(data_container), data_collector],
    )

    simulation_data_directory = get_input_data_directory_path(data) + "/"

    if not os.path.exists(simulation_data_directory):
        print(f"Simulation data directory {simulation_data_directory} does not exist")
        return

    simulator = Simulator(
        simulation_data_directory,
        visualizers=environment_observer.visualizers,
        data_collectors=environment_observer.data_collectors,
    )
    simulation_thread = threading.Thread(target=simulator.simulate)
    simulation_thread.start()

    # Wait for the simulation to finish
    while simulation_thread.is_alive() and (stop_event is None or not stop_event.is_set()):
        simulation_thread.join(timeout=5)  # Check every 5 seconds

    if simulation_thread.is_alive():
        print("Simulation is still running, stopping it")
        simulator.stop()

    simulation_thread.join()

    if stop_event is not None:
        stop_event.set()


def configure_simulation_parser(
    parser: ArgumentParser | None = None,  # pylint: disable=redefined-outer-name
) -> ArgumentParser:
    if parser is None:
        parser = argparse.ArgumentParser(description="Run a simulation")

    parser.add_argument("--name", type=str, help="The name of the simulation")
    parser.add_argument("--data", type=str, help="The data to use for the simulation")
    parser.add_argument("--max-duration", type=float, help="The maximum duration to run the simulation")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Run the simulation in offline mode (does not connect to the server)",
    )

    return parser


def start_simulation_cli(parsed_arguments: Namespace) -> None:
    name = parsed_arguments.name
    data = parsed_arguments.data
    max_duration = parsed_arguments.max_duration
    is_offline = parsed_arguments.offline

    name_error = verify_simulation_name(name)

    while name_error is not None:
        print(f"Error: {name_error}")
        name = questionary.text("Enter the name of the simulation (spaces will be replaced by underscores)").ask()

        if name is None:
            print("Exiting")
            return

        name_error = verify_simulation_name(name)

    name = name.replace(" ", "_")

    available_data = get_available_data()

    if len(available_data) == 0:
        print("No input data is available, please provide some in the data folder")
        sys.exit(1)

    if data is None:
        # Get all available data

        data = questionary.select(
            "Select the data to use for the simulation",
            choices=available_data,
        ).ask()

        print("Selected data:", data)

    if data not in available_data:
        print("The provided data is not available")
        sys.exit(1)

    simulation_id, _ = build_simulation_id(name)

    print(
        f"Running simulation with id: {simulation_id}, data: {data} and "
        f"{f'max duration: {max_duration}' if max_duration is not None else 'no max duration'}"
        f"{is_offline and ' in offline mode' or ''}"
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
        f"viewer simulate --data {data} "
        f"{f'--max-duration {max_duration} ' if max_duration is not None else ''}"
        f"{'--offline ' if is_offline else ''}"
        f"--name {name}"  # Name last to allow quick name change when re-running the command
    )


if __name__ == "__main__":
    parser = configure_simulation_parser()
    args = parser.parse_args()
    start_simulation_cli(args)
