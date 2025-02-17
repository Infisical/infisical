package gateway

import (
	"bufio"
	"bytes"
	"fmt"
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
			log.Error().Msgf("Error reading command: %s", err)
			return
		}

		cmd := bytes.ToUpper(bytes.TrimSpace(bytes.Split(msg, []byte(" "))[0]))
		args := bytes.TrimSpace(bytes.TrimPrefix(msg, cmd))

		switch string(cmd) {
		case "FORWARD-TCP":
			proxyAddress := string(bytes.Split(args, []byte(" "))[0])
			fmt.Println(proxyAddress)
			destTarget, err := net.Dial("tcp", proxyAddress)
			fmt.Println(err)
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
			break
		case "PING":
			conn.Write([]byte("PONG\n"))
		default:
			log.Error().Msgf("Unknown command: %s", string(cmd))
			break
		}
	}
}

type CloseWrite interface {
	CloseWrite() error
}

func CopyData(src, dst net.Conn) {
	// Create a WaitGroup to wait for both copy operations
	var wg sync.WaitGroup
	wg.Add(2)

	// Start copying in both directions
	go func() {
		defer wg.Done()
		if _, err := io.Copy(dst, src); err != nil {
			log.Error().Msgf("Error copying postgres->client: %v", err)
		}

		if e, ok := dst.(CloseWrite); ok {
			log.Print("Closing dst")
			e.CloseWrite()
		} else {

			log.Print("Not closed")
		}
	}()

	go func() {
		defer wg.Done()
		if _, err := io.Copy(src, dst); err != nil {
			log.Error().Msgf("Error copying client->postgres: %v", err)
		}
		if e, ok := src.(CloseWrite); ok {
			log.Print("Closing src")
			e.CloseWrite()
		} else {
			log.Print("Not closed")
		}
	}()

	// Wait for both copies to complete
	wg.Wait()
}
