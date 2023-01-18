/* eslint-disable */
// TODO(akhilmhdh): Danger. This file functions needs to simplified.
// Disabled eslinting as below algos uses unnary operator and need to be careful on handling it
// Will revisit this and change to simplier non-recursive to dynamic programming with space allocation strategy
/**
 *
 * @param textOld - old secret
 * @param textNew - new (updated) secret
 * @param diffPlusFlag - a flag for whether we want to detect moving segments
 * - doesn't work in some examples (e.g., when we have a full reverse ordering of the text)
 * @returns
 */
function patienceDiff(textOld: string[], textNew: string[], diffPlusFlag?: boolean) {
  /**
   * findUnique finds all unique values in arr[lo..hi], inclusive. This
   * function is used in preparation for determining the longest common
   * subsequence. Specifically, it first reduces the array range in question
   * to unique values.
   * @param chars - an array of characters
   * @param lo
   * @param hi
   * @returns - an ordered Map, with the arr[i] value as the Map key and the
   * array index i as the Map value.
   */
  function findUnique(chars: string[], lo: number, hi: number) {
    const characterMap = new Map();

    for (let i = lo; i <= hi; i += 1) {
      const character = chars[i];

      if (characterMap.has(character)) {
        characterMap.get(character).count += 1;
        characterMap.get(character).index = i;
      } else {
        characterMap.set(character, { count: 1, index: i });
      }
    }

    characterMap.forEach((val, key, map) => {
      if (val.count !== 1) {
        map.delete(key);
      } else {
        map.set(key, val.index);
      }
    });

    return characterMap;
  }

  /**
   * @param aArray
   * @param aLo
   * @param aHi
   * @param bArray
   * @param bLo
   * @param bHi
   * @returns an ordered Map, with the Map key as the common line between aArray
   * and bArray, with the Map value as an object containing the array indexes of
   * the matching unique lines.
   *
   */
  function uniqueCommon(
    aArray: string[],
    aLo: number,
    aHi: number,
    bArray: string[],
    bLo: number,
    bHi: number
  ) {
    const ma = findUnique(aArray, aLo, aHi);
    const mb = findUnique(bArray, bLo, bHi);

    ma.forEach((val, key, map) => {
      if (mb.has(key)) {
        map.set(key, {
          indexA: val,
          indexB: mb.get(key)
        });
      } else {
        map.delete(key);
      }
    });

    return ma;
  }

  /**
   * longestCommonSubsequence takes an ordered Map from the function uniqueCommon
   * and determines the Longest Common Subsequence (LCS).
   * @param abMap
   * @returns an ordered array of objects containing the array indexes of the
   * matching lines for a LCS.
   */
  function longestCommonSubsequence(
    abMap: Map<number, { indexA: number; indexB: number; prev?: number }>
  ) {
    const ja: any = [];

    // First, walk the list creating the jagged array.
    abMap.forEach((val, key, map) => {
      let i = 0;

      while (ja[i] && ja[i][ja[i].length - 1].indexB < val.indexB) {
        i += 1;
      }

      if (!ja[i]) {
        ja[i] = [];
      }

      if (i > 0) {
        val.prev = ja[i - 1][ja[i - 1].length - 1];
      }
      ja[i].push(val);
    });

    // Now, pull out the longest common subsequence.
    let lcs: any[] = [];

    if (ja.length > 0) {
      const n = ja.length - 1;
      lcs = [ja[n][ja[n].length - 1]];

      while (lcs[lcs.length - 1].prev) {
        lcs.push(lcs[lcs.length - 1].prev);
      }
    }

    return lcs.reverse();
  }

  // "result" is the array used to accumulate the textOld that are deleted, the
  // lines that are shared between textOld and textNew, and the textNew that were
  // inserted.

  const result: any[] = [];
  let deleted = 0;
  let inserted = 0;

  // aMove and bMove will contain the lines that don't match, and will be returned
  // for possible searching of lines that moved.

  const aMove: any[] = [];
  const aMoveIndex: any[] = [];
  const bMove: any[] = [];
  const bMoveIndex: any[] = [];

  /**
   * addToResult simply pushes the latest value onto the "result" array. This
   * array captures the diff of the line, aIndex, and bIndex from the textOld
   * and textNew array.
   * @param aIndex
   * @param bIndex
   */
  function addToResult(aIndex: number, bIndex: number) {
    if (bIndex < 0) {
      aMove.push(textOld[aIndex]);
      aMoveIndex.push(result.length);
      deleted += 1;
    } else if (aIndex < 0) {
      bMove.push(textNew[bIndex]);
      bMoveIndex.push(result.length);
      inserted += 1;
    }

    result.push({
      line: aIndex >= 0 ? textOld[aIndex] : textNew[bIndex],
      aIndex,
      bIndex
    });
  }

  /**
   * addSubMatch handles the lines between a pair of entries in the LCS. Thus,
   * this function might recursively call recurseLCS to further match the lines
   * between textOld and textNew.
   * @param aLo
   * @param aHi
   * @param bLo
   * @param bHi
   */
  function addSubMatch(aLo: number, aHi: number, bLo: number, bHi: number) {
    // Match any lines at the beginning of textOld and textNew.
    while (aLo <= aHi && bLo <= bHi && textOld[aLo] === textNew[bLo]) {
      addToResult(aLo++, bLo++);
    }

    // Match any lines at the end of textOld and textNew, but don't place them
    // in the "result" array just yet, as the lines between these matches at
    // the beginning and the end need to be analyzed first.

    const aHiTemp = aHi;
    while (aLo <= aHi && bLo <= bHi && textOld[aHi] === textNew[bHi]) {
      aHi -= 1;
      bHi -= 1;
    }

    // Now, check to determine with the remaining lines in the subsequence
    // whether there are any unique common lines between textOld and textNew.
    //
    // If not, add the subsequence to the result (all textOld having been
    // deleted, and all textNew having been inserted).
    //
    // If there are unique common lines between textOld and textNew, then let's
    // recursively perform the patience diff on the subsequence.

    const uniqueCommonMap = uniqueCommon(textOld, aLo, aHi, textNew, bLo, bHi);

    if (uniqueCommonMap.size === 0) {
      while (aLo <= aHi) {
        addToResult(aLo++, -1);
      }

      while (bLo <= bHi) {
        addToResult(-1, bLo++);
      }
    } else {
      recurseLCS(aLo, aHi, bLo, bHi, uniqueCommonMap);
    }

    // Finally, let's add the matches at the end to the result.
    while (aHi < aHiTemp) {
      addToResult(++aHi, ++bHi);
    }
  }

  /**
   * recurseLCS finds the longest common subsequence (LCS) between the arrays
   * textOld[aLo..aHi] and textNew[bLo..bHi] inclusive.  Then for each subsequence
   * recursively performs another LCS search (via addSubMatch), until there are
   * none found, at which point the subsequence is dumped to the result.
   * @param aLo
   * @param aHi
   * @param bLo
   * @param bHi
   * @param uniqueCommonMap
   */
  function recurseLCS(aLo: number, aHi: number, bLo: number, bHi: number, uniqueCommonMap?: any) {
    const x = longestCommonSubsequence(
      uniqueCommonMap || uniqueCommon(textOld, aLo, aHi, textNew, bLo, bHi)
    );

    if (x.length === 0) {
      addSubMatch(aLo, aHi, bLo, bHi);
    } else {
      if (aLo < x[0].indexA || bLo < x[0].indexB) {
        addSubMatch(aLo, x[0].indexA - 1, bLo, x[0].indexB - 1);
      }

      let i;
      for (i = 0; i < x.length - 1; i += 1) {
        addSubMatch(x[i].indexA, x[i + 1].indexA - 1, x[i].indexB, x[i + 1].indexB - 1);
      }

      if (x[i].indexA <= aHi || x[i].indexB <= bHi) {
        addSubMatch(x[i].indexA, aHi, x[i].indexB, bHi);
      }
    }
  }

  recurseLCS(0, textOld.length - 1, 0, textNew.length - 1);

  if (diffPlusFlag) {
    return {
      lines: result,
      lineCountDeleted: deleted,
      lineCountInserted: inserted,
      lineCountMoved: 0,
      aMove,
      aMoveIndex,
      bMove,
      bMoveIndex
    };
  }

  return {
    lines: result,
    lineCountDeleted: deleted,
    lineCountInserted: inserted,
    lineCountMoved: 0
  };
}

/**
 * use:  patienceDiffPlus( textOld[], textNew[] )
 *
 * where:
 *      textOld[] contains the original text lines.
 *      textNew[] contains the new text lines.
 *
 * returns an object with the following properties:
 *      lines[] with properties of:
 *          line containing the line of text from textOld or textNew.
 *          aIndex referencing the index in aLine[].
 *          bIndex referencing the index in textNew[].
 *              (Note:  The line is text from either textOld or textNew, with aIndex and bIndex
 *               referencing the original index. If aIndex === -1 then the line is new from textNew,
 *               and if bIndex === -1 then the line is old from textOld.)
 *          moved is true if the line was moved from elsewhere in textOld[] or textNew[].
 *      lineCountDeleted is the number of lines from textOld[] not appearing in textNew[].
 *      lineCountInserted is the number of lines from textNew[] not appearing in textOld[].
 *      lineCountMoved is the number of lines that moved.
 */

function patienceDiffPlus(textOld: string[], textNew: string[]) {
  const difference = patienceDiff(textOld, textNew, true);

  let aMoveNext = difference.aMove;
  let aMoveIndexNext = difference.aMoveIndex;
  let bMoveNext = difference.bMove;
  let bMoveIndexNext = difference.bMoveIndex;

  delete difference.aMove;
  delete difference.aMoveIndex;
  delete difference.bMove;
  delete difference.bMoveIndex;

  let lastLineCountMoved;

  do {
    const aMove = aMoveNext;
    const aMoveIndex = aMoveIndexNext;
    const bMove = bMoveNext;
    const bMoveIndex = bMoveIndexNext;

    aMoveNext = [];
    aMoveIndexNext = [];
    bMoveNext = [];
    bMoveIndexNext = [];

    const subDiff = patienceDiff(aMove!, bMove!);

    lastLineCountMoved = difference.lineCountMoved;

    subDiff.lines.forEach((v, i) => {
      if (v.aIndex >= 0 && v.bIndex >= 0) {
        difference.lines[aMoveIndex![v.aIndex]].moved = true;
        difference.lines[bMoveIndex![v.bIndex]].aIndex = aMoveIndex![v.aIndex];
        difference.lines[bMoveIndex![v.bIndex]].moved = true;
        difference.lineCountInserted -= 1;
        difference.lineCountDeleted -= 1;
        difference.lineCountMoved += 1;
      } else if (v.bIndex < 0) {
        aMoveNext!.push(aMove![v.aIndex]);
        aMoveIndexNext!.push(aMoveIndex![v.aIndex]);
      } else {
        bMoveNext!.push(bMove![v.bIndex]);
        bMoveIndexNext!.push(bMoveIndex![v.bIndex]);
      }
    });
  } while (difference.lineCountMoved - lastLineCountMoved > 0);

  return difference;
}

export default patienceDiff;
