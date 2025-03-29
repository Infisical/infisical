package template

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"fmt"
)

const (
	errNilCert           = "certificate is nil"
	errFoundDisjunctCert = "found multiple leaf or disjunct certificates"
	errNoLeafFound       = "no leaf certificate found"
	errChainCycle        = "constructing chain resulted in cycle"
)

type node struct {
	cert     *x509.Certificate
	parent   *node
	isParent bool
}

func fetchX509CertChains(data []byte) []*x509.Certificate {
	var newCertChain []*x509.Certificate
	nodes := pemToNodes(data)

	// at the end of this computation, the output will be a single linked list
	// the tail of the list will be the root node (which has no parents)
	// the head of the list will be the leaf node (whose parent will be intermediate certs)
	// (head) leaf -> intermediates -> root (tail)
	for i := range nodes {
		for j := range nodes {
			// ignore same node to prevent generating a cycle
			if i == j {
				continue
			}
			// if ith node AuthorityKeyId is same as jth node SubjectKeyId, jth node was used
			// to sign the ith certificate
			if bytes.Equal(nodes[i].cert.AuthorityKeyId, nodes[j].cert.SubjectKeyId) {
				nodes[j].isParent = true
				nodes[i].parent = nodes[j]
				break
			}
		}
	}

	var foundLeaf bool
	var leaf *node
	for i := range nodes {
		if !nodes[i].isParent {
			if foundLeaf {
				panic(fmt.Sprintf("[fetchX509CertChains] Error: %v", errFoundDisjunctCert))
			}
			// this is the leaf node as it's not a parent for any other node
			leaf = nodes[i]
			foundLeaf = true
		}
	}

	if leaf == nil {
		panic(fmt.Sprintf("[fetchX509CertChains] Error: %v", errNoLeafFound))
	}

	processedNodes := 0
	// iterate through the directed list and append the nodes to new cert chain
	for leaf != nil {
		processedNodes++
		// ensure we aren't stuck in a cyclic loop
		if processedNodes > len(nodes) {
			panic(fmt.Sprintf("[fetchX509CertChains] Error: %v", errChainCycle))
		}
		newCertChain = append(newCertChain, leaf.cert)
		leaf = leaf.parent
	}
	return newCertChain
}

func fetchCertChains(data []byte) []byte {
	var pemData []byte
	newCertChain := fetchX509CertChains(data)

	for _, cert := range newCertChain {
		b := &pem.Block{
			Type:  pemTypeCertificate,
			Bytes: cert.Raw,
		}
		pemData = append(pemData, pem.EncodeToMemory(b)...)
	}
	return pemData
}

func pemToNodes(data []byte) []*node {
	nodes := make([]*node, 0)
	for {
		// decode pem to der first
		block, rest := pem.Decode(data)
		data = rest

		if block == nil {
			break
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			panic(fmt.Sprintf("[pemToNodes] Error: %v", err))
		}

		if cert == nil {
			panic(fmt.Sprintf("[pemToNodes] Error: %v", errNilCert))
		}
		nodes = append(nodes, &node{
			cert:     cert,
			parent:   nil,
			isParent: false,
		})
	}
	return nodes
}
