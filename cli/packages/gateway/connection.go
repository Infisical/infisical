package gateway

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"net"
	"sync"

	"github.com/rs/zerolog/log"
)

func handleConnection(conn net.Conn) {
	defer conn.Close()
	log.Info().Msgf("New connection from: %s", conn.RemoteAddr().String())

	// Use buffered reader for better handling of fragmented data
	reader := bufio.NewReader(conn)
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

			CopyData(conn, destTarget)
			return
		case "PING":
			if _, err := conn.Write([]byte("PONG")); err != nil {
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

func CopyData(src, dst net.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)

	copyAndClose := func(dst, src net.Conn, done chan<- bool) {
		defer wg.Done()
		_, err := io.Copy(dst, src)
		if err != nil && !errors.Is(err, io.EOF) {
			log.Error().Msgf("Copy error: %v", err)
		}

		// Signal we're done writing
		done <- true

		// Half close the connection if possible
		if c, ok := dst.(CloseWrite); ok {
			c.CloseWrite()
		}
	}

	done1 := make(chan bool, 1)
	done2 := make(chan bool, 1)

	go copyAndClose(dst, src, done1)
	go copyAndClose(src, dst, done2)

	// Wait for both copies to complete
	<-done1
	<-done2
	wg.Wait()
}
