// Factory mirroring `MapRenderer::create` from libtiled.

import { type Map, MapOrientation } from '@tiled-ts/core';
import { OrthogonalRendererMath } from './orthogonal.js';
import { IsometricRendererMath } from './isometric.js';
import { HexagonalRendererMath, StaggeredRendererMath } from './hexagonal.js';
import { ObliqueRendererMath } from './oblique.js';
import type { MapRendererMath } from './types.js';

export function createRendererMath(map: Map): MapRendererMath {
  switch (map.orientation) {
    case MapOrientation.Isometric:
      return new IsometricRendererMath(map);
    case MapOrientation.Staggered:
      return new StaggeredRendererMath(map);
    case MapOrientation.Hexagonal:
      return new HexagonalRendererMath(map);
    case MapOrientation.Oblique:
      return new ObliqueRendererMath(map);
    case MapOrientation.Orthogonal:
    default:
      return new OrthogonalRendererMath(map);
  }
}
