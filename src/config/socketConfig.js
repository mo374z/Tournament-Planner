function updateSocketConfig(args) {
    const useHttps = args.includes('--https');
    const portIndex = args.findIndex(arg => arg === '--port');
    const defaultPort = useHttps ? 2443 : 3000;
    const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : defaultPort;
    const socketPortIndex = args.findIndex(arg => arg === '--socket-port');
    const socketPort = socketPortIndex !== -1 ? parseInt(args[socketPortIndex + 1]) : 2053;
    
    // Detect if running in production (NODE_ENV=production) or behind Nginx proxy
    const isProduction = process.env.NODE_ENV === 'production';
    
    // In production behind Nginx, don't specify port - let Socket.IO use the same origin
    // In development, connect directly to the WebSocket server port
    socketConfig = {
        protocol: useHttps ? 'https' : 'http',
        host: useHttps ? 'budescharfeseck.gretzinger.net' : 'localhost',
        port: port,
        socketPort: socketPort,
        // For client connection: in production, use empty string to connect to same origin
        // In development, use the explicit port
        clientSocketUrl: isProduction ? '' : `${useHttps ? 'https' : 'http'}://${useHttps ? 'budescharfeseck.gretzinger.net' : 'localhost'}:${socketPort}`,
        useExplicitPort: !isProduction  // Flag to indicate if client should use explicit port
    };

    return socketConfig;
}

module.exports = {updateSocketConfig};
