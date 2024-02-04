// MIT License

// Copyright (c) 2019 Zachary Rice

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

package detect

// Location represents a location in a file
type Location struct {
	startLine      int
	endLine        int
	startColumn    int
	endColumn      int
	startLineIndex int
	endLineIndex   int
}

func location(fragment Fragment, matchIndex []int) Location {
	var (
		prevNewLine int
		location    Location
		lineSet     bool
		_lineNum    int
	)

	start := matchIndex[0]
	end := matchIndex[1]

	// default startLineIndex to 0
	location.startLineIndex = 0

	// Fixes: https://github.com/zricethezav/gitleaks/issues/1037
	// When a fragment does NOT have any newlines, a default "newline"
	// will be counted to make the subsequent location calculation logic work
	// for fragments will no newlines.
	if len(fragment.newlineIndices) == 0 {
		fragment.newlineIndices = [][]int{
			{len(fragment.Raw), len(fragment.Raw) + 1},
		}
	}

	for lineNum, pair := range fragment.newlineIndices {
		_lineNum = lineNum
		newLineByteIndex := pair[0]
		if prevNewLine <= start && start < newLineByteIndex {
			lineSet = true
			location.startLine = lineNum
			location.endLine = lineNum
			location.startColumn = (start - prevNewLine) + 1 // +1 because counting starts at 1
			location.startLineIndex = prevNewLine
			location.endLineIndex = newLineByteIndex
		}
		if prevNewLine < end && end <= newLineByteIndex {
			location.endLine = lineNum
			location.endColumn = (end - prevNewLine)
			location.endLineIndex = newLineByteIndex
		}
		prevNewLine = pair[0]
	}

	if !lineSet {
		// if lines never get set then that means the secret is most likely
		// on the last line of the diff output and the diff output does not have
		// a newline
		location.startColumn = (start - prevNewLine) + 1 // +1 because counting starts at 1
		location.endColumn = (end - prevNewLine)
		location.startLine = _lineNum + 1
		location.endLine = _lineNum + 1

		// search for new line byte index
		i := 0
		for end+i < len(fragment.Raw) {
			if fragment.Raw[end+i] == '\n' {
				break
			}
			if fragment.Raw[end+i] == '\r' {
				break
			}
			i++
		}
		location.endLineIndex = end + i
	}
	return location
}
