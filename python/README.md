# multimodalsim-viewer

This package provides an interface to the [multimodalsim simulation project](https://pypi.org/project/multimodalsim/), allowing you to run and visualize simulations easily through a web interface.

## Usage

You have access to several commands that will allow you to run the project easily.

```bash
viewer start 
viewer start --ui     # only start the UI side
viewer start --server # only start the server 

viewer stop
viewer stop --ui     # only stop the UI side
viewer stop --server # only stop the server
```

You can also run a simulation from the command line. This is useful for debugging, when you want to run a simulation without the web interface, and also for running simulations that uses a different version of the multimodalsim package.

Several arguments are available to customize the simulation and can be found with the --help option, but the required arguments will be asked interactively if not provided. The command to run a simulation is:

```bash
viewer simulate
```

## `DataCollector`

The `SimulationVisualizationDataCollector` class is used to collect data from the simulation and visualize it. You can pass an instance of this class to the simulation to collect data during the simulation. This might be useful if you work on the multimodalsim package and want to visualize the simulation data in real-time.

## Input data

To run a simulation, you need to provide input data. You can upload input data folders through the web interface. Some basic input data folders are available [here](https://github.com/lab-core/multimodal-data). You can also clone the repository and use the data from there : 

```bash
git clone https://github.com/lab-core/multimodal-data.git
```