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
import type { PubSub } from '@libp2p/interface';

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
      connectionEncryption: [noise()],
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

    this.node.addEventListener('peer:connect', (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      log.info('peer connected', { peer: detail.toString() });
    });

    this.node.addEventListener('peer:disconnect', (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      log.info('peer disconnected', { peer: detail.toString() });
    });

    const pubsub = this.node.services.pubsub as PubSub;
    pubsub.subscribe(GOSSIP_TOPIC);
    pubsub.addEventListener('message', (evt: Event) => {
      const message = (evt as CustomEvent).detail;
      this.onGossipMessage?.(message.data);
    });

    log.info('libp2p swarm started', { peerId: this.node.peerId.toString() });
  }

  async stop(): Promise<void> {
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
    const pubsub = this.node.services.pubsub as PubSub;
    await pubsub.publish(GOSSIP_TOPIC, data);
  }

  handleMCPStream(handler: (data: Uint8Array, peerId: string) => Promise<Uint8Array>): void {
    if (!this.node) return;
    this.node.handle('/bam-mcp/1.0.0', async ({ stream, connection }) => {
      const remotePeerId = connection.remotePeer.toString();
      for await (const chunk of stream.source) {
        const data = new Uint8Array(chunk.subarray(0, chunk.byteLength));
        const response = await handler(data, remotePeerId);
        await (stream.sink as (src: AsyncIterable<Uint8Array>) => Promise<void>)((async function* () { yield response; })());
      }
    });
  }
}
