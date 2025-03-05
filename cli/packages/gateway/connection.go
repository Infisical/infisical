package gateway

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"strings"
	"sync"

	"github.com/quic-go/quic-go"
	"github.com/rs/zerolog/log"
)

func handleConnection(ctx context.Context, quicConn quic.Connection) {
	log.Info().Msgf("New connection from: %s", quicConn.RemoteAddr().String())
	// Use WaitGroup to track all streams
	var wg sync.WaitGroup
	for {
		// Accept the first stream, which we'll use for commands
		stream, err := quicConn.AcceptStream(ctx)
		if err != nil {
			log.Printf("Failed to accept QUIC stream: %v", err)
			break
		}
		wg.Add(1)
		go func(stream quic.Stream) {
			defer wg.Done()
			defer stream.Close()

			handleStream(stream, quicConn)
		}(stream)
	}

	wg.Wait()
	log.Printf("All streams closed for connection: %s", quicConn.RemoteAddr().String())
}

func handleStream(stream quic.Stream, quicConn quic.Connection) {
	streamID := stream.StreamID()
	log.Printf("New stream %d from: %s", streamID, quicConn.RemoteAddr().String())

	// Use buffered reader for better handling of fragmented data
	reader := bufio.NewReader(stream)
	defer stream.Close()

	for {
		msg, err := reader.ReadBytes('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			log.Error().Msgf("Error reading command: %s", err)
			return
		}

		cmd := bytes.ToUpper(bytes.TrimSpace(bytes.Split(msg, []byte(" "))[0]))
		args := bytes.TrimSpace(bytes.TrimPrefix(msg, cmd))

		switch string(cmd) {
		case "FORWARD-TCP":
			proxyAddress := string(bytes.Split(args, []byte(" "))[0])
			destTarget, err := net.Dial("tcp", proxyAddress)
			if err != nil {
				log.Error().Msgf("Failed to connect to target: %v", err)
				return
			}
			defer destTarget.Close()
			log.Info().Msgf("Starting secure transmission between %s->%s", quicConn.LocalAddr().String(), destTarget.LocalAddr().String())

			// Handle buffered data
			buffered := reader.Buffered()
			if buffered > 0 {
				bufferedData := make([]byte, buffered)
				_, err := reader.Read(bufferedData)
				if err != nil {
					log.Error().Msgf("Error reading buffered data: %v", err)
					return
				}

				if _, err = destTarget.Write(bufferedData); err != nil {
					log.Error().Msgf("Error writing buffered data: %v", err)
					return
				}
			}

			CopyDataFromQuicToTcp(stream, destTarget)
			log.Info().Msgf("Ending secure transmission between %s->%s", quicConn.LocalAddr().String(), destTarget.LocalAddr().String())
			return
		case "PING":
			if _, err := stream.Write([]byte("PONG\n")); err != nil {
				log.Error().Msgf("Error writing PONG response: %v", err)
			}
			return
		default:
			log.Error().Msgf("Unknown command: %s", string(cmd))
			return
		}
	}
}

type CloseWrite interface {
	CloseWrite() error
}

func CopyDataFromQuicToTcp(quicStream quic.Stream, tcpConn net.Conn) {
	// Create a WaitGroup to wait for both copy operations
	var wg sync.WaitGroup
	wg.Add(2)

	// Start copying from QUIC stream to TCP
	go func() {
		defer wg.Done()
		if _, err := io.Copy(tcpConn, quicStream); err != nil {
			log.Error().Msgf("Error copying quic->postgres: %v", err)
		}

		if e, ok := tcpConn.(CloseWrite); ok {
			log.Debug().Msg("Closing TCP write end")
			e.CloseWrite()
		} else {
			log.Debug().Msg("TCP connection does not support CloseWrite")
		}
	}()

	// Start copying from TCP to QUIC stream
	go func() {
		defer wg.Done()
		if _, err := io.Copy(quicStream, tcpConn); err != nil {
			log.Debug().Msgf("Error copying postgres->quic: %v", err)
		}
		// Close the write side of the QUIC stream
		if err := quicStream.Close(); err != nil && !strings.Contains(err.Error(), "close called for canceled stream") {
			log.Error().Msgf("Error closing QUIC stream write: %v", err)
		}
	}()

	// Wait for both copies to complete
	wg.Wait()
}
