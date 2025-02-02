import {
  detectOverflow,
  Options as DetectOverflowOptions,
} from '../detectOverflow';
import {allPlacements} from '../enums';
import type {Alignment, Middleware, Placement} from '../types';
import {getAlignment} from '../utils/getAlignment';
import {getAlignmentSides} from '../utils/getAlignmentSides';
import {getOppositeAlignmentPlacement} from '../utils/getOppositeAlignmentPlacement';
import {getSide} from '../utils/getSide';

export function getPlacementList(
  alignment: Alignment | null,
  autoAlignment: boolean,
  allowedPlacements: Array<Placement>
) {
  const allowedPlacementsSortedByAlignment = alignment
    ? [
        ...allowedPlacements.filter(
          (placement) => getAlignment(placement) === alignment
        ),
        ...allowedPlacements.filter(
          (placement) => getAlignment(placement) !== alignment
        ),
      ]
    : allowedPlacements.filter((placement) => getSide(placement) === placement);

  return allowedPlacementsSortedByAlignment.filter((placement) => {
    if (alignment) {
      return (
        getAlignment(placement) === alignment ||
        (autoAlignment
          ? getOppositeAlignmentPlacement(placement) !== placement
          : false)
      );
    }

    return true;
  });
}

export interface Options {
  /**
   * Whether to check for most space along the crossAxis of the placement (the
   * axis that runs along the alignment).
   * @default false
   */
  crossAxis: boolean;
  /**
   * Choose placements with a particular alignment.
   * @default undefined
   */
  alignment: Alignment | null;
  /**
   * Which placements are allowed to be chosen. Placements must be within the
   * `alignment` option set.
   * @default allPlacements (variable)
   */
  allowedPlacements: Array<Placement>;
  /**
   * Whether to choose placements with the opposite alignment if they will fit
   * better.
   * @default true
   */
  autoAlignment: boolean;
}

/**
 * Automatically chooses the `placement` which has the most space available.
 * @see https://floating-ui.com/docs/autoPlacement
 */
export const autoPlacement = (
  options: Partial<Options & DetectOverflowOptions> = {}
): Middleware => ({
  name: 'autoPlacement',
  options,
  async fn(middlewareArguments) {
    const {rects, middlewareData, placement, platform, elements} =
      middlewareArguments;

    const {
      crossAxis = false,
      alignment,
      allowedPlacements = allPlacements,
      autoAlignment = true,
      ...detectOverflowOptions
    } = options;

    const placements =
      alignment !== undefined || allowedPlacements === allPlacements
        ? getPlacementList(alignment || null, autoAlignment, allowedPlacements)
        : allowedPlacements;

    const overflow = await detectOverflow(
      middlewareArguments,
      detectOverflowOptions
    );

    const currentIndex = middlewareData.autoPlacement?.index || 0;
    const currentPlacement = placements[currentIndex];

    if (currentPlacement == null) {
      return {};
    }

    const {main, cross} = getAlignmentSides(
      currentPlacement,
      rects,
      await platform.isRTL?.(elements.floating)
    );

    // Make `computeCoords` start from the right place.
    if (placement !== currentPlacement) {
      return {
        reset: {
          placement: placements[0],
        },
      };
    }

    const currentOverflows = [
      overflow[getSide(currentPlacement)],
      overflow[main],
      overflow[cross],
    ];

    const allOverflows = [
      ...(middlewareData.autoPlacement?.overflows || []),
      {placement: currentPlacement, overflows: currentOverflows},
    ];

    const nextPlacement = placements[currentIndex + 1];

    // There are more placements to check.
    if (nextPlacement) {
      return {
        data: {
          index: currentIndex + 1,
          overflows: allOverflows,
        },
        reset: {
          placement: nextPlacement,
        },
      };
    }

    const placementsSortedByMostSpace = allOverflows
      .map((d) => {
        const alignment = getAlignment(d.placement);
        return [
          d.placement,
          alignment && crossAxis
            ? // Check along the mainAxis and main crossAxis side.
              d.overflows.slice(0, 2).reduce((acc, v) => acc + v, 0)
            : // Check only the mainAxis.
              d.overflows[0],
          d.overflows,
        ] as const;
      })
      .sort((a, b) => a[1] - b[1]);

    const placementsThatFitOnEachSide = placementsSortedByMostSpace.filter(
      (d) =>
        d[2]
          .slice(
            0,
            // Aligned placements should not check their opposite crossAxis
            // side.
            getAlignment(d[0]) ? 2 : 3
          )
          .every((v) => v <= 0)
    );

    const resetPlacement =
      placementsThatFitOnEachSide[0]?.[0] || placementsSortedByMostSpace[0][0];

    if (resetPlacement !== placement) {
      return {
        data: {
          index: currentIndex + 1,
          overflows: allOverflows,
        },
        reset: {
          placement: resetPlacement,
        },
      };
    }

    return {};
  },
});
