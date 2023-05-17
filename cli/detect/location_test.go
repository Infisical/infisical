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

import (
	"testing"
)

// TestGetLocation tests the getLocation function.
func TestGetLocation(t *testing.T) {
	tests := []struct {
		linePairs    [][]int
		start        int
		end          int
		wantLocation Location
	}{
		{
			linePairs: [][]int{
				{0, 39},
				{40, 55},
				{56, 57},
			},
			start: 35,
			end:   38,
			wantLocation: Location{
				startLine:      1,
				startColumn:    36,
				endLine:        1,
				endColumn:      38,
				startLineIndex: 0,
				endLineIndex:   40,
			},
		},
		{
			linePairs: [][]int{
				{0, 39},
				{40, 55},
				{56, 57},
			},
			start: 40,
			end:   44,
			wantLocation: Location{
				startLine:      2,
				startColumn:    1,
				endLine:        2,
				endColumn:      4,
				startLineIndex: 40,
				endLineIndex:   56,
			},
		},
	}

	for _, test := range tests {
		loc := location(Fragment{newlineIndices: test.linePairs}, []int{test.start, test.end})
		if loc != test.wantLocation {
			t.Errorf("\nstartLine %d\nstartColumn: %d\nendLine: %d\nendColumn: %d\nstartLineIndex: %d\nendlineIndex %d",
				loc.startLine, loc.startColumn, loc.endLine, loc.endColumn, loc.startLineIndex, loc.endLineIndex)

			t.Error("got", loc, "want", test.wantLocation)
		}
	}
}
