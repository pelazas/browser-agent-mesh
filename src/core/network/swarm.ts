import { createLibp2p, type Libp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { bootstrap } from '@libp2p/bootstrap';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { createLogger } from '@utils/logging';
import { GOSSIP_TOPIC } from './mcp/types';

const log = createLogger('swarm');

export interface SwarmConfig {
  signalingUrl: string;
  bootstrapPeers: string[];
}

export class SwarmNode {
  private node: Libp2p | null = null;
  private config: SwarmConfig;
  private onGossipMessage?: (data: Uint8Array) => void;

  constructor(config: SwarmConfig) {
    this.config = config;
  }

  onGossip(handler: (data: Uint8Array) => void): void {
    this.onGossipMessage = handler;
  }

  async start(): Promise<void> {
    this.node = await createLibp2p({
      addresses: {
        listen: ['/webrtc'],
      },
      transports: [
        webRTC({
          rtcConfiguration: {
            iceServers: [{ urls: import.meta.env.VITE_STUN_SERVERS || 'stun:stun.l.google.com:19302' }],
          },
        }),
        webSockets(),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        bootstrap({
          list: this.config.bootstrapPeers,
        }),
      ],
      services: {
        dht: kadDHT(),
        pubsub: gossipsub(),
      },
    });

    this.node.addEventListener('peer:connect', (evt) => {
      log.info('peer connected', { peer: evt.detail.toString() });
    });

    this.node.addEventListener('peer:disconnect', (evt) => {
      log.info('peer disconnected', { peer: evt.detail.toString() });
    });

    // Subscribe to gossip topic
    this.node.services.pubsub.subscribe(GOSSIP_TOPIC);
    this.node.services.pubsub.addEventListener('message', (evt) => {
      this.onGossipMessage?.(evt.detail.data);
    });

    log.info('libp2p swarm started', { peerId: this.node.peerId.toString() });
  }

  async stop(): void {
    if (this.node) {
      await this.node.stop();
      this.node = null;
      log.info('libp2p swarm stopped');
    }
  }

  getPeerId(): string | null {
    return this.node?.peerId.toString() ?? null;
  }

  getPeerCount(): number {
    return this.node?.getPeers().length ?? 0;
  }

  getNode(): Libp2p | null {
    return this.node;
  }

  async publishToGossip(data: Uint8Array): Promise<void> {
    if (!this.node) return;
    await this.node.services.pubsub.publish(GOSSIP_TOPIC, data);
  }

  handleMCPStream(handler: (data: Uint8Array, peerId: string) => Promise<Uint8Array>): void {
    if (!this.node) return;
    this.node.handle('/legion-mcp/1.0.0', async ({ stream }) => {
      const reader = stream.source.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const response = await handler(value, stream.remotePeer.toString());
        await stream.sink.write(response);
      }
    });
  }
}
