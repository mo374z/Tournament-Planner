function updateSocketConfig(args) {
    const useHttps = args.includes('--https');
    const portIndex = args.findIndex(arg => arg === '--port');
    const defaultPort = useHttps ? 443 : 3000;
    const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : defaultPort;
    const socketPortIndex = args.findIndex(arg => arg === '--socket-port');
    const socketPort = socketPortIndex !== -1 ? parseInt(args[socketPortIndex + 1]) : 2053;
    
    socketConfig = {
        protocol: useHttps ? 'https' : 'http',
        host: useHttps ? 'budescharfeseck.de' : 'localhost',
        port: port,
        socketPort: socketPort
    };

    return socketConfig;
}

module.exports = {updateSocketConfig};
