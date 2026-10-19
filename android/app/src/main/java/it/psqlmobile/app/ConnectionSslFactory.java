package it.psqlmobile.app;

import java.util.Properties;
import org.postgresql.ssl.WrappedFactory;

/** pgJDBC constructs a fresh factory with this connection's properties. */
public final class ConnectionSslFactory extends WrappedFactory {
    public ConnectionSslFactory(Properties properties)throws Exception{factory=TlsCertificates.factory(properties);}
}
