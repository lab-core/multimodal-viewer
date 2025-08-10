import { decode } from '@googlemaps/polyline-codec';
import { Position } from './position.model';

export interface Polyline {
  polyline: Position[];
  coefficients: number[];
}

export interface AllPolylines {
  version: number;
  polylinesByCoordinates: Record<string, Polyline>;
}

export function extractAllPolylines(
  serializedPolylinesByCoordinates: unknown,
  version: unknown,
): AllPolylines | null {
  if (
    !Array.isArray(serializedPolylinesByCoordinates) ||
    !serializedPolylinesByCoordinates.every(
      (serializedPolyline) => typeof serializedPolyline === 'string',
    )
  ) {
    console.error(
      'Invalid serialized polylines by coordinates',
      serializedPolylinesByCoordinates,
    );
    return null;
  }

  if (typeof version !== 'number') {
    console.error('Invalid polylines version', version);
    return null;
  }

  const polylinesByCoordinates: Record<string, Polyline> = {};

  for (const serializedPolyline of serializedPolylinesByCoordinates) {
    const polyline: unknown = JSON.parse(serializedPolyline);

    // Verify polyline object
    if (typeof polyline !== 'object' || polyline === null) {
      console.error('Invalid data type for polyline', polyline);
      return null;
    }

    if (
      !('coordinatesString' in polyline) ||
      typeof polyline.coordinatesString !== 'string'
    ) {
      console.error('Invalid coordinates string in polyline', polyline);
      return null;
    }
    const coordinatesString: string = polyline.coordinatesString;

    if (
      !('coefficients' in polyline) ||
      !Array.isArray(polyline.coefficients) ||
      !polyline.coefficients.every(
        (coefficient) => typeof coefficient === 'number',
      )
    ) {
      console.error('Invalid coefficients in polyline', polyline);
      return null;
    }
    const coefficients: number[] = polyline.coefficients;

    if (
      !('encodedPolyline' in polyline) ||
      typeof polyline.encodedPolyline !== 'string'
    ) {
      console.error('Invalid encoded polyline in polyline', polyline);
      return null;
    }
    const encodedPolyline: string = polyline.encodedPolyline;

    // Decode the polyline
    const decodedPolyline = decode(encodedPolyline).map((point) => ({
      latitude: point[0],
      longitude: point[1],
    }));

    // Verify the decoded polyline and the coefficients
    if (
      decodedPolyline.length > 1 &&
      coefficients.length !== decodedPolyline.length - 1
    ) {
      if (coefficients.length === 1 && coefficients[0] === 1) {
        // The simulation was unable to calculate the coefficients, but
        // we can still make the vehicle move at a constant speed.
        const distances = [];

        for (let index = 0; index < decodedPolyline.length - 1; index++) {
          const point1 = decodedPolyline[index];
          const point2 = decodedPolyline[index + 1];

          const distance = Math.sqrt(
            (point2.latitude - point1.latitude) ** 2 +
              (point2.longitude - point1.longitude) ** 2,
          );

          distances.push(distance);
        }

        const totalDistance = distances.reduce((a, b) => a + b, 0);

        if (totalDistance === 0) {
          console.error(
            'Total distance is zero, cannot calculate coefficients of decoded polyline',
            decodedPolyline,
            'in polyline',
            polyline,
          );
          return null;
        }

        coefficients.splice(
          0,
          coefficients.length,
          ...distances.map((distance) => distance / totalDistance),
        );
      } else {
        console.error(
          'Polyline coefficients length mismatch in decoded polyline',
          decodedPolyline,
          'in polyline',
          polyline,
        );
        return null;
      }
    }

    polylinesByCoordinates[coordinatesString] = {
      polyline: decodedPolyline,
      coefficients,
    };
  }

  return { version, polylinesByCoordinates };
}
