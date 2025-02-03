import logging  # Required to modify the log level
# import multiprocessing
# import time
from typing import Optional
import threading

from multimodalsim.observer.environment_observer import (
    EnvironmentObserver, StandardEnvironmentObserver)
from multimodalsim.observer.visualizer import Visualizer
# from multimodalsim.optimization.fixed_line.fixed_line_dispatcher import \
#     FixedLineDispatcher
# from multimodalsim.optimization.optimization import Optimization
# from multimodalsim.optimization.splitter import (MultimodalSplitter,
#                                                  OneLegSplitter)
# from multimodalsim.reader.data_reader import GTFSReader
# from multimodalsim.simulator.coordinates import CoordinatesFromFile
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event
# from multimodalsim.simulator.simulation import Simulation
# from multimodalsim.simulator.vehicle_event import (VehicleReady,
#                                                    VehicleUpdatePositionEvent)
from socketio import Client
from multimodalsim.simulator.simulator import Simulator

HOST = '127.0.0.1'
PORT = 5000



def run_simulation(name):
    sio = Client()

    sio.connect(f'http://{HOST}:{PORT}', auth={'type': 'simulation'})

    sio.emit('simulation/started', name)
    class CustomVisualizer(Visualizer):
        
        def __init__(self) -> None:
            super().__init__()

        def visualize_environment(self, env: Environment,
                                current_event: Optional[Event] = None,
                                event_index: Optional[int] = None,
                                event_priority: Optional[int] = None) -> None:
            if current_event is not None:  
                logging.info(f"Visualizing environment at time {env.current_time} with event {current_event.name}")
            else:          
                logging.info(f"Visualizing environment at time {env.current_time}")      

            # TODO Send data to server
            
    class CustomObserver(EnvironmentObserver):

        def __init__(self) -> None:
            super().__init__(visualizers=CustomVisualizer())
            
    # Read input data from files with a DataReader. The DataReader returns a
    # list of Vehicle objects and a list of Trip objects.
    # gtfs_folder_path = "../data/instance_19/gtfs/"
    # requests_file_path = "../data/instance_19/requests.csv"
    # data_reader = GTFSReader(gtfs_folder_path, requests_file_path)

    # To estimate the coordinates from an OSRM server, use the following:
    # coordinates = CoordinatesOSRM()

    # vehicles, routes_by_vehicle_id = data_reader.get_vehicles()
    # trips = data_reader.get_trips()

    # Initialize the optimizer.
    # splitter = OneLegSplitter()
    # dispatcher = FixedLineDispatcher()
    # opt = Optimization(dispatcher, splitter)

    # Initialize the observer.
    environment_observer = CustomObserver()

    simulation_directory = "../data/instance_19/"
    simulator = Simulator(simulation_directory, environment_observer.visualizers)
    simulation_thread = threading.Thread(target=simulator.simulate,
                                         name="test")
    simulation_thread.start()

    # # Initialize the simulation.
    # simulation = Simulation(opt, trips, vehicles, routes_by_vehicle_id,
    #                         environment_observer=environment_observer, config='simulation.ini')

    # # Execute the simulation.
    # simulation.simulate()

    # sio.emit('simulation/ended', name)

    @sio.on('simulation/simulationEnd')
    def stopSimulator():
        simulator.stop()
        sio.disconnect()
