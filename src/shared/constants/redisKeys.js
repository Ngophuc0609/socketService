function userSocketKey(userType, userId) {
  return `socket:uid:${userType}:${userId}`;
}

function socketInfoKey(socketId) {
  return `socket:info:${socketId}`;
}

function roomSocketKey(roomName) {
  return `socket:room:${roomName}`;
}

function locationKey(userId) {
  return `location:${userId}`;
}

module.exports = {
  userSocketKey,
  socketInfoKey,
  roomSocketKey,
  locationKey,
};
