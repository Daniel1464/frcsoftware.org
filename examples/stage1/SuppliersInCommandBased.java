import java.util.function.DoubleSupplier;

void main() {
  var motor = new ExampleMotor();
  var xbox = new CommandXboxController(0);

  // [doubleSupplierExample]
  DoubleSupplier supplier = () -> xbox.getLeftY();
  double controllerOutput = supplier.getAsDouble();
  // [/doubleSupplierExample]

  // [triggerBooleanSupplier]
  new Trigger(() -> motor.speed() > 60);
  // [/triggerBooleanSupplier]
}

private void correctCommand() {
  // [correctCommand]
  class Robot {
    public Robot() {
      var xbox = new CommandXboxController(0);
      var intake = new Intake();
      intake.setDefaultCommand(
        intake.runAtThrottle(() -> xbox.getLeftY())
      );
    }
  }
  // [/correctCommand]
}

private void incorrectCommand() {
  // [incorrectCommand]
  class Robot {
    public Robot() {
      var xbox = new CommandXboxController(0);
      var intake = new Intake();
      double controllerOutput = xbox.getLeftY();
      intake.setDefaultCommand(
        intake.runAtThrottle(controllerOutput)
      );
    }
  }
  // [/incorrectCommand]
}

// [runAtThrottleDouble]
class Intake {
  // Placeholder for TalonFX, SparkMax or SparkFlex
  private final ExampleMotor motor = new ExampleMotor();

  public Command runAtThrottle(double throttle) {
    return run(coroutine -> {
      while (true) {
        motor.setThrottle(throttle);
        coroutine.yield();
      }
    })
      .named("Run Intake");
  }
}
// [/runAtThrottleDouble]

class SuppliersInCommands implements Mechanism {
  private final ExampleMotor motor = new ExampleMotor();

  // [runAtThrottleSupplier]
  public Command runAtThrottle(DoubleSupplier throttleSupplier) {
    return run(coroutine -> {
      while (true) {
        double throttle = throttleSupplier.getAsDouble();
        motor.setThrottle(throttle);
        coroutine.yield();
      }
    })
      .named("Run Intake");
  }
  // [/runAtThrottleSupplier]

  // [untilModifier]
  // From the Intake class mentioned earlier
  public Command fullThrottleUntilRobotDisabled() {
    return fullThrottle()
      .until(() -> MatchState.isDisabled())
      .named("Full Throttle Until Disable");
  }

  private Command fullThrottle() {
    return null; // placeholder for actual command
  }
  // [/untilModifier]
}

class ExampleMotor {
  double speed() { return 0; }
  void setThrottle(double throttle) {}
}
