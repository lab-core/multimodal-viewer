from flask import Blueprint, jsonify

http_routes = Blueprint("http_routes", __name__)

@http_routes.route("/api/data", methods=["GET"])
def get_data():
    return jsonify({"message": "Hello from Flask!"})
