function userSocketKey(userType, userId) {
  return `socket:user:${userType}:${userId}`;
}

function socketInfoKey(socketId) {
  return `socket:info:${socketId}`;
}

function roomSocketKey(roomName) {
  return `socket:room:${roomName}`;
}

function locationKey(userId) {
  return `socket:loc:${userId}`;
}

module.exports = {
  userSocketKey,
  socketInfoKey,
  roomSocketKey,
  locationKey,
};
