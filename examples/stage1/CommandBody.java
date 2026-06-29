void main() {
  // [triangleLoop]
  int number = 1;
  while (number < 4) {
    System.out.println("-".repeat(number));
    number = number + 1;
  }
  while (number > 0) {
    System.out.println("-".repeat(number));
    number = number - 1;
  }
  // [/triangleLoop]

  var exampleCommand = Command.noRequirements(coroutine -> {
    var motor = new ExampleMotor();
    var gyroscope = new ExampleGyro();
    var differentialDrive = new ExampleDrivetrain();

    // [fullThrottleCmdBody]
    System.out.println("Full Speed Baby!");
    while (true) {
      motor.setThrottle(1.0);
      coroutine.yield(); // Confused? We'll explain this in the section below
    }
    // [/fullThrottleCmdBody]

    // [rotate90CommandBody]
    double targetDirection = gyroscope.getYawDegrees() + 90;
    while (gyroscope.getYawDegrees() < targetDirection) {
      differentialDrive.arcadeDrive(0, 0.5);
      coroutine.yield();
    }
    differentialDrive.arcadeDrive(0, 0);
    // [/rotate90CommandBody]
  })
    .named("Example!");
}

class ExampleMotor {
  void setThrottle(double throttle) {}
}

class ExampleGyro {
  double getYawDegrees() { return 0; } 
}

class ExampleDrivetrain {
  void differentialDrive(double forward, double rotation) {}
}
