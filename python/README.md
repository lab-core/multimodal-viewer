# multimodalsim-viewer

This package provides an interface to the [multimodalsim simulation project](https://pypi.org/project/multimodalsim/), allowing you to run and visualize simulations easily through a web interface.

## Usage

You have access to several commands that will allow you to run the project easily. You can use the `--help` flag to see a list of available options.

```bash
viewer start 

viewer stop

viewer simulate
```

## `DataCollector`

The `SimulationVisualizationDataCollector` class is used to collect data from the simulation and visualize it. You can pass an instance of this class to the simulation to collect data during the simulation. This might be useful if you work on the multimodalsim package and want to visualize the simulation data in real-time.

## Input data

To run a simulation, you need to provide input data. You can upload input data folders through the web interface. Some basic input data folders are available [here](https://github.com/lab-core/multimodal-data). You can also clone the repository and use the data from there : 

```bash
git clone https://github.com/lab-core/multimodal-data.git
```

## Environment variables

Some environment variables are available to customize the application. You can find a detailed list of these variables in the [README.md](https://github.com/lab-core/multimodal-simulator/blob/main/README.md#environment-variables) file of the multimodal-simulator repository.