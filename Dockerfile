# Use Node.js base image with Python
FROM node:22-slim

# Install Python, Chromium, and ChromeDriver
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Create symlink for python command
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm ci

# Install Python dependencies
RUN pip3 install selenium --break-system-packages

# Copy the rest of the application
COPY . .

# Build the React frontend
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server/index.js"]
