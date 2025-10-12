import logging
import os
import shutil
import tempfile
import zipfile
from typing import Callable

from flask import Blueprint, jsonify, request, send_file

from multimodalsim_viewer.server.data_manager import SimulationVisualizationDataManager
from multimodalsim_viewer.server.simulation_manager import SimulationManager


class InvalidFilesRequestError(Exception):
    def __init__(self, error_message: str) -> None:
        self.error_message = error_message


def http_routes(simulation_manager: SimulationManager):  # pylint: disable=too-many-statements
    blueprint = Blueprint("http_routes", __name__)

    # MARK: Helpers
    def get_unique_folder_name(base_path, folder_name):
        counter = 1
        original_name = folder_name
        while os.path.exists(os.path.join(base_path, folder_name)):
            folder_name = f"{original_name}_({counter})"
            counter += 1
        return folder_name

    def zip_folder(folder_path, zip_name):
        if not os.path.isdir(folder_path):
            return None

        zip_path = os.path.join(tempfile.gettempdir(), f"{zip_name}.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for root, _, files in os.walk(folder_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    zip_file.write(file_path, os.path.relpath(file_path, folder_path))

        return zip_path

    def save_and_extract_zip(path: str, files):
        try:
            if "file" not in files:
                raise InvalidFilesRequestError("No file part")

            file = files["file"]
            if file.filename == "":
                raise InvalidFilesRequestError("No selected file")

            # Create temporary zip file
            zip_path = os.path.join(tempfile.gettempdir(), file.filename)
            file.save(zip_path)

            # Extract files
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(path)
                logging.info("Extracted files: %s", zip_ref.namelist())

        # Let the exception propagate
        finally:
            # Remove temporary zip file
            if os.path.exists(zip_path):
                os.remove(zip_path)

    def handle_zip_upload(folder_path, on_success: Callable | None = None):
        parent_dir = os.path.dirname(folder_path)
        base_folder_name = os.path.basename(folder_path)

        unique_folder_name = get_unique_folder_name(parent_dir, base_folder_name)
        actual_folder_path = os.path.join(parent_dir, unique_folder_name)

        os.makedirs(actual_folder_path, exist_ok=True)

        try:
            save_and_extract_zip(actual_folder_path, request.files)
        except InvalidFilesRequestError as error:
            return jsonify({"error": error.error_message}), 400
        except zipfile.BadZipFile:
            return jsonify({"error": "Invalid ZIP file"}), 400

        response_message = f"Folder '{unique_folder_name}' uploaded successfully"
        if unique_folder_name != base_folder_name:
            response_message += f" (renamed from '{base_folder_name}')"

        if on_success:
            on_success()

        return (
            jsonify({"message": response_message, "folderName": unique_folder_name}),
            201,
        )

    # MARK: Instances
    @blueprint.route("/api/input_data/<folder_name>", methods=["GET"])
    def export_input_data(folder_name):
        folder_path = SimulationVisualizationDataManager.get_input_data_directory_path(folder_name)
        logging.info("Requested folder: %s", folder_path)

        zip_path = zip_folder(folder_path, folder_name)
        if not zip_path:
            return jsonify({"error": "Folder not found"}), 404

        return send_file(zip_path, as_attachment=True)

    @blueprint.route("/api/input_data/<folder_name>", methods=["POST"])
    def import_input_data(folder_name):
        folder_path = SimulationVisualizationDataManager.get_input_data_directory_path(folder_name)
        return handle_zip_upload(folder_path)

    @blueprint.route("/api/input_data/<folder_name>", methods=["DELETE"])
    def delete_input_data(folder_name):
        folder_path = SimulationVisualizationDataManager.get_input_data_directory_path(folder_name)
        if not os.path.isdir(folder_path):
            return jsonify({"error": "Folder not found"}), 404

        shutil.rmtree(folder_path)
        return jsonify({"message": f"Folder '{folder_name}' deleted successfully"})

    # MARK: Visualizations
    @blueprint.route("/api/simulation/<folder_name>", methods=["GET"])
    def export_saved_simulation(folder_name):
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)
        logging.info("Requested folder: %s", folder_path)

        zip_path = zip_folder(folder_path, folder_name)
        if not zip_path:
            return jsonify({"error": "Folder not found"}), 404

        return send_file(zip_path, as_attachment=True)

    @blueprint.route("/api/simulation/<folder_name>", methods=["POST"])
    def import_saved_simulation(folder_name):
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)

        def on_success():
            simulation_manager.emit_simulation(folder_name)

        return handle_zip_upload(folder_path, on_success)

    @blueprint.route("/api/simulation/<folder_name>", methods=["DELETE"])
    def delete_saved_simulation(folder_name):
        folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)

        if not os.path.isdir(folder_path):
            return jsonify({"error": "Folder not found"}), 404

        shutil.rmtree(folder_path)

        simulation_manager.on_simulation_delete(folder_name)

        return jsonify({"message": f"Folder '{folder_name}' deleted successfully"})

    return blueprint
